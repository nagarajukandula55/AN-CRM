import crypto from "crypto";
import bcryptjs from "bcryptjs";
import VendorProfile, { IVendorProfile } from "@/models/VendorProfile";
import Agreement from "@/models/Agreement";
import User from "@/models/User";
import BusinessMember, { BusinessMemberStatus } from "@/models/BusinessMember";
import VendorStaffSlot, { VENDOR_DESIGNATIONS } from "@/models/VendorStaffSlot";
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";
import { createDefaultVendorRoles } from "@/core/access/vendorDefaultRoles.service";
import { generateUniqueUserId } from "@/lib/auth/generateUserId";
import { sendAccountCredentialsEmail } from "@/services/email/resend.service";

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
  vendor.status = "ACTIVE";
  vendor.isApproved = true;
  vendor.finalApprovedBy = actorId as any;
  vendor.finalApprovedAt = new Date();
  await vendor.save();

  await createDefaultVendorRoles(vendor._id.toString(), (vendor.businessId as any).toString());
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

  return { ok: true, vendor, tempPassword };
}
