import crypto from "crypto";
import bcryptjs from "bcryptjs";
import VendorProfile, { IVendorProfile } from "@/models/VendorProfile";
import Agreement, { ISignature } from "@/models/Agreement";
import User from "@/models/User";
import BusinessMember, { BusinessMemberStatus } from "@/models/BusinessMember";
import VendorStaffSlot, { VENDOR_DESIGNATIONS } from "@/models/VendorStaffSlot";
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";
import Subscription from "@/models/Subscription";
import { createDefaultVendorRoles } from "@/core/access/vendorDefaultRoles.service";
import { generateUniqueUserId } from "@/lib/auth/generateUserId";
import { logAction } from "@/lib/audit/logAction";
import { sendAccountCredentialsEmail, sendAgreementOtpEmail } from "@/services/email/resend.service";
import { sendTelegramMessage } from "@/lib/telegram";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Shared by activateVendorAfterAgreement (the normal, admin-driven flow)
 * and activateVendorWithTrial (the skip-approval instant-trial flow, see
 * below) -- both need the exact same login/BusinessMember/default-roles/
 * staff-slot provisioning, just triggered at a different point in the
 * onboarding lifecycle. Sets vendor.userId but deliberately does NOT touch
 * vendor.status/isApproved/finalApprovedBy -- callers set those themselves
 * since the two flows mean different things by "activated" (one requires a
 * fully-signed agreement first, the other doesn't).
 */
async function provisionVendorLogin(
  vendor: IVendorProfile,
  actorId: string
): Promise<{ tempPassword: string | null }> {
  let user = vendor.userId
    ? await User.findOne({ _id: vendor.userId, isDeleted: false })
    : await User.findOne({ email: vendor.email, isDeleted: false });

  let tempPassword: string | null = null;

  if (!user) {
    tempPassword = crypto.randomBytes(9).toString("base64url");
    const hashed = await bcryptjs.hash(tempPassword, 12);

    user = await User.create({
      name: vendor.contactPerson || vendor.companyName,
      email: vendor.email,
      username: await generateUniqueUserId(),
      password: hashed,
      phone: vendor.phone || undefined,
      role: "VENDOR",
      isActive: true,
      isEmailVerified: false,
      authProvider: "credentials",
      defaultBusinessId: vendor.businessId,
      mustChangePassword: true,
    });
  } else if (!user.isActive) {
    user.isActive = true;
    await user.save();
  }

  await BusinessMember.updateOne(
    { userId: user._id, businessId: vendor.businessId },
    {
      $set: {
        status: BusinessMemberStatus.ACTIVE,
        memberType: "VENDOR",
        invitedBy: actorId,
        isDeleted: false,
      },
      $setOnInsert: { isDefaultBusiness: true, joinedAt: new Date() },
    },
    { upsert: true }
  );

  vendor.userId = user._id as any;

  await createDefaultVendorRoles(
    vendor._id.toString(),
    (vendor.businessId as any).toString(),
    vendor.appliedAs
  );
  const ownerRole = await Role.findOne({
    code: "VENDOR_OWNER",
    businessId: vendor.businessId,
    vendorId: vendor._id,
  });
  if (ownerRole) {
    await UserRole.updateOne(
      { userId: user._id, roleId: ownerRole._id },
      { $setOnInsert: { userId: user._id, roleId: ownerRole._id, businessId: vendor.businessId } },
      { upsert: true }
    );
  }

  await Promise.all(
    VENDOR_DESIGNATIONS.map((designation) => {
      const isManager = designation === "MANAGER";
      return VendorStaffSlot.updateOne(
        { vendorId: vendor._id, designation },
        {
          $setOnInsert: {
            businessId: vendor.businessId,
            vendorId: vendor._id,
            designation,
            status: isManager ? "ACTIVE" : "INACTIVE",
            userId: isManager ? vendor.userId : null,
            activatedAt: isManager ? new Date() : undefined,
          },
        },
        { upsert: true }
      );
    })
  );

  // Absolute URL -- a relative "/vendor" path in an email the recipient
  // opens outside the app has nothing to resolve against.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (tempPassword && vendor.email) {
    sendAccountCredentialsEmail({
      to: vendor.email,
      name: vendor.contactPerson || vendor.companyName,
      tempPassword,
      loginUrl: `${baseUrl}/vendor`,
      businessId: (vendor.businessId as any)?.toString(),
    }).catch(() => {});
  }

  return { tempPassword };
}

/**
 * Extracted from api/vendors/[id]/finalize/route.ts's POST handler so the
 * exact same activation logic (create login, BusinessMember, default
 * roles/staff slots, credentials email) can be triggered from TWO places:
 * the existing manual finalize route (an admin explicitly clicking
 * "Finalize"), and api/agreements/[id]/countersign/route.ts (automatically,
 * the instant the Super Admin/Owner's own signature completes the
 * agreement) -- per explicit direction that the moment the final signature
 * lands, credentials should go out immediately, not wait on a second
 * manual step. Behavior is identical either way; idempotent, same as the
 * original route already was.
 */
export async function activateVendorAfterAgreement(
  vendorId: string,
  actorId: string
): Promise<
  | { ok: true; vendor: IVendorProfile; tempPassword: string | null }
  | { ok: false; error: string; status: number }
> {
  const vendor = await VendorProfile.findById(vendorId);
  if (!vendor || vendor.isDeleted) {
    return { ok: false, error: "Vendor not found", status: 404 };
  }

  if (["ACTIVE", "APPROVED"].includes(vendor.status)) {
    return { ok: false, error: "Vendor is already approved", status: 400 };
  }

  if (!vendor.agreementId) {
    return { ok: false, error: "No agreement linked — run the review/approve step first", status: 400 };
  }
  const agreement = await (Agreement as any).findById(vendor.agreementId).lean();
  if (!agreement) {
    return { ok: false, error: "Linked agreement not found", status: 400 };
  }
  const SIGNED_STATES = ["SIGNED", "FULLY_SIGNED"];
  if (!SIGNED_STATES.includes(agreement.status)) {
    return {
      ok: false,
      error: `Agreement is ${agreement.status} — it must be fully signed before final approval`,
      status: 400,
    };
  }

  const { tempPassword } = await provisionVendorLogin(vendor, actorId);

  vendor.status = "ACTIVE";
  vendor.isApproved = true;
  vendor.finalApprovedBy = actorId as any;
  vendor.finalApprovedAt = new Date();
  await vendor.save();

  return { ok: true, vendor, tempPassword };
}

/**
 * Skip-approval instant-trial flow -- triggered inline from POST
 * /api/vendors/apply the moment a VendorProfile is created, ONLY when the
 * target Business has marketplace.skipVendorApproval on (see
 * Business.ts). Unlike the normal review -> sign -> finalize pipeline
 * (activateVendorAfterAgreement above), this collapses all of it into one
 * synchronous call: draft + OTP-send the partner agreement (same shape as
 * api/vendors/[id]/review/route.ts), provision the portal login right
 * away (not gated on the agreement actually being signed), and open a
 * 7-day TRIAL Subscription so the vendor can use the portal immediately.
 *
 * Deliberately never throws -- this runs inline in a PUBLIC endpoint after
 * the VendorProfile has already been saved; a failure here (email
 * provider down, etc.) must not fail the application itself. Callers
 * should await it but ignore/log a { ok: false } result rather than
 * surfacing it as a request error.
 */
export async function activateVendorWithTrial(
  vendor: IVendorProfile,
  businessId: string
): Promise<
  | { ok: true; vendor: IVendorProfile; tempPassword: string | null }
  | { ok: false; error: string }
> {
  try {
    const vendorDisplay = vendor.contactPerson || vendor.companyName;

    const content = `VENDOR PARTNER AGREEMENT (TRIAL ONBOARDING)

This Vendor Partner Agreement ("Agreement") is entered into between the Company and ${vendorDisplay} ("the Vendor").

The Vendor has been onboarded under this Business's instant-trial vendor program: portal access begins immediately, with a 7-day trial period during which no payment is due. Continued access after the trial requires selecting a paid plan.

1. SCOPE — The Vendor shall supply products/services to the Company and may list approved products on the Company's sales channels, subject to the Company's review and approval.

2. ORDERS & FULFILMENT — Orders received on the Company's channels will be shared with the Vendor for confirmation.

3. PAYMENTS — The Company shall settle Vendor invoices per the agreed payment terms (${vendor.paymentTerms || "30 days"}).

4. QUALITY & COMPLIANCE — The Vendor warrants that all supplied products meet applicable quality, safety and labelling standards.

5. TERM & TERMINATION — Either party may terminate with 30 days' written notice.

6. GOVERNING LAW — This Agreement is governed by the laws of India.

By signing below, both parties agree to the terms above.`;

    const agreement = await (Agreement as any).create({
      businessId,
      createdBy: vendor.userId,
      title: `Vendor Partner Agreement — ${vendorDisplay}`,
      type: "VENDOR",
      content,
      parties: [
        {
          name: vendor.contactPerson || vendor.companyName,
          email: vendor.email,
          role: "Vendor",
        },
      ],
      signatures: [],
      status: "DRAFT",
    });

    const vendorParty = agreement.parties.find((p: any) => p.role === "Vendor");
    if (vendorParty?.email) {
      const rawOtp = generateOtp();
      const hashedOtp = await bcryptjs.hash(rawOtp, 10);
      const otpExpiry = new Date(Date.now() + 30 * 60 * 1000);

      agreement.signatures.push({
        partyEmail: vendorParty.email,
        partyName: vendorParty.name,
        partyRole: "Vendor",
        otpVerified: false,
        otp: hashedOtp,
        otpExpiry,
      } as ISignature);
      agreement.status = "PENDING_SIGNATURE";
      await agreement.save();

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const signingLink = `${baseUrl}/agreements/${agreement._id}/sign?email=${encodeURIComponent(vendorParty.email)}`;
      sendAgreementOtpEmail({
        to: vendorParty.email,
        partyName: vendorParty.name,
        agreementTitle: agreement.title,
        otp: rawOtp,
        signingLink,
        businessId,
      })
        .then(() => sendTelegramMessage(`📄 <b>Agreement emailed</b>\n${vendorParty.name} (${vendorParty.email}) — trial onboarding`))
        .catch((err) => sendTelegramMessage(`⚠️ <b>Agreement email FAILED</b>\n${vendorParty.name} (${vendorParty.email}): ${err?.message || err}`).catch(() => {}));
    }

    vendor.agreementId = agreement._id as any;
    vendor.status = "ACTIVE";
    vendor.isApproved = true;
    await vendor.save();

    const { tempPassword } = await provisionVendorLogin(vendor, String(vendor.userId || "system"));
    await vendor.save();
    if (tempPassword) {
      sendTelegramMessage(`🔑 <b>Credentials emailed</b>\n${vendor.companyName} (${vendor.email}) — new login provisioned`).catch(() => {});
    }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await (Subscription as any).create({
      businessId,
      subVendorOf: vendor._id,
      mode: vendor.appliedAs || "BRAND",
      plan: "BASIC",
      billingPeriod: "MONTHLY",
      status: "TRIAL",
      amount: 0,
      startDate: now,
      trialEndsAt: trialEnd,
      expiryDate: trialEnd,
      createdBy: vendor.userId,
    });

    sendTelegramMessage(`✅ <b>Vendor activated on 7-day trial</b>\n${vendor.companyName} (${vendor.appliedAs || "BRAND"}) — ${vendor.email}`).catch(() => {});
    return { ok: true, vendor, tempPassword };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("activateVendorWithTrial failed:", msg);
    sendTelegramMessage(`🚨 <b>Vendor trial activation FAILED</b>\n${vendor.companyName} (${vendor.email}): ${msg}`).catch(() => {});
    try {
      logAction({
        action: "UPDATE",
        entity: "VendorProfile",
        entityId: vendor._id?.toString(),
        after: { error: msg, context: "activateVendorWithTrial" },
      });
    } catch {
      // best-effort logging only
    }
    return { ok: false, error: msg };
  }
}
