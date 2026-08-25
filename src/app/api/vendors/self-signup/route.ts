import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import bcryptjs from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import VendorProfile from "@/models/VendorProfile";
import Business from "@/models/Business";
import { generateUniqueUserId } from "@/lib/auth/generateUserId";
import { generateGlobalDocumentNumber } from "@/core/numbering/numberingService";
import { provisionVendorLogin } from "@/services/vendorActivation.service";
import { getPlatformBusinessId } from "@/lib/centralApiRead";
import { notifySuperAdmins } from "@/services/notification.service";
import { logAction } from "@/lib/audit/logAction";
import { sendAdminSystemAlert } from "@/core/telegram/sendAdminSystemAlert";

const TRIAL_DAYS = 7;

/**
 * POST /api/vendors/self-signup — PUBLIC, ONE-STEP vendor signup.
 *
 * AUTO-APPROVES on the spot -- no admin review step anywhere in this flow
 * per explicit direction ("No Approval required anywhere auto approve it.
 * Anybody can signup and can take subscription"). Creates the User AND an
 * ACTIVE, immediately-usable VendorProfile in one call: real login
 * provisioned (BusinessMember + default roles + staff slot, same as the
 * admin-driven activation path — see provisionVendorLogin), assigned to
 * the platform's own Business (same resolution api/vendors/apply/route.ts
 * uses), and given TRIAL_DAYS of free full access starting right now (see
 * trialEndsAt on VendorProfile, and lib/vendor/checkTrialAccess.ts for how
 * that's enforced once it lapses). No plan/payment required to use the
 * portal during the trial -- picking and paying for a plan is entirely
 * optional until the trial runs out.
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { name, companyName, email, phone, password, appliedAs } = body;

    if (!name?.trim() || !companyName?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { success: false, message: "Name, company name, email, and password are required" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json({ success: false, message: "Password must be at least 8 characters" }, { status: 400 });
    }
    // SC (Service Center) is the only vendor type this platform supports
    // now -- BRAND and POS were removed.
    if (appliedAs && appliedAs !== "SC") {
      return NextResponse.json({ success: false, message: "Invalid business type" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail, isDeleted: { $ne: true } });
    if (existing) {
      return NextResponse.json(
        { success: false, message: "An account with this email already exists. Try logging in instead." },
        { status: 409 }
      );
    }

    // Same resolution order as api/vendors/apply/route.ts: central-api's
    // platform-business lookup first, then the env var, then an isPlatform
    // Business flag as a last-resort fallback -- every self-signed-up
    // vendor lands on this one shared platform business (matches the
    // existing multi-vendor-under-one-Business architecture the rest of
    // this app already assumes).
    let resolvedBusinessId =
      (await getPlatformBusinessId("an-crm")) ||
      process.env.AN_CRM_MY_BIZ_FLOW_BUSINESS_ID?.trim() ||
      null;
    let business: { _id: unknown } | null = null;
    if (resolvedBusinessId && Types.ObjectId.isValid(resolvedBusinessId)) {
      business = await Business.findOne({ _id: resolvedBusinessId, isActive: true }).select("_id").lean<any>();
    }
    if (!business) {
      business = await Business.findOne({ isPlatform: true, isActive: true }).select("_id").lean<any>();
      if (business) resolvedBusinessId = String((business as any)._id);
    }
    if (!business) {
      return NextResponse.json(
        { success: false, message: "No platform business configured — contact support" },
        { status: 500 }
      );
    }

    const hashedPassword = await bcryptjs.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      username: await generateUniqueUserId(),
      password: hashedPassword,
      phone: phone?.trim() || undefined,
      role: "VENDOR",
      isActive: true,
      isEmailVerified: false,
      authProvider: "credentials",
      defaultBusinessId: resolvedBusinessId,
    });

    const { value: vendorId } = await generateGlobalDocumentNumber("VENDOR", resolvedBusinessId);

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const vendor = await VendorProfile.create({
      userId: user._id,
      businessId: resolvedBusinessId,
      vendorId,
      companyName: companyName.trim(),
      contactPerson: name.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || undefined,
      appliedAs: appliedAs || "SC",
      status: "ACTIVE",
      isApproved: true,
      finalApprovedAt: now,
      trialEndsAt,
    });

    // Real login provisioning -- BusinessMember row, default vendor roles,
    // owner UserRole grant, staff slots. Never sends a NEW credentials
    // email here (the password above was already chosen by the vendor
    // themselves, so provisionVendorLogin's tempPassword branch is a
    // no-op) -- it only finalizes username=vendorId and the role/access
    // plumbing, same as every other activation path in this app.
    await provisionVendorLogin(vendor, String(user._id));

    logAction({
      action: "CREATE",
      entity: "VendorProfile",
      entityId: vendor._id.toString(),
      after: { companyName: vendor.companyName, appliedAs: vendor.appliedAs, trialEndsAt },
      req,
      actor: { id: user._id.toString() },
    });

    notifySuperAdmins({
      title: "New vendor signup (auto-activated)",
      message: `${companyName.trim()} (${vendorId}) signed up and is live now on a ${TRIAL_DAYS}-day trial.`,
      link: "/console/admin/vendors",
    }).catch(() => {});

    sendAdminSystemAlert(
      "NEW_VENDOR_SIGNUP",
      `New vendor signup: ${companyName.trim()} (${vendorId}), ${normalizedEmail} -- auto-activated, ${TRIAL_DAYS}-day trial started.`
    ).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        message: `You're all set! Your account is active with ${TRIAL_DAYS} days of full access, no payment needed yet.`,
        vendorId: vendor._id,
        loginId: vendorId,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
