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
import { notifyAdmins } from "@/core/telegram/notifyAdmins";
import { sendWelcomeEmail } from "@/services/email/resend.service";
import VendorSubscription from "@/models/VendorSubscription";
import { findPlan, type PlanKey } from "@/core/pricing/plans";
import { trackEvent } from "@/core/analytics/trackEvent";

const VALID_PLAN_KEYS: PlanKey[] = ["STARTER", "BASIC", "ULTIMATE"];

const TRIAL_DAYS = 15;

// ONE-TIME pre-launch goodwill window (see VendorProfile.earlyAccessAnchor's
// own comment): anyone signing up before this cutoff gets both their trial
// AND their first paid period counted from EARLY_ACCESS_ANCHOR instead of
// their real signup instant, so testing before the official go-live date
// costs them none of their real free days. Server-clock-only cutoff, never
// derived from client input -- not a recurring mechanism, just this window.
const EARLY_ACCESS_CUTOFF = new Date("2026-09-01T00:00:00+05:30");
const EARLY_ACCESS_ANCHOR = new Date("2026-09-01T00:00:00+05:30");

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
    const { name, companyName, email, phone, password, appliedAs, planKey, referredByCode } = body;
    const requestedPlanKey: PlanKey = VALID_PLAN_KEYS.includes(planKey) ? planKey : "BASIC";

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
    const earlyAccessAnchor = now.getTime() < EARLY_ACCESS_CUTOFF.getTime() ? EARLY_ACCESS_ANCHOR : null;
    const trialCountFrom = earlyAccessAnchor || now;
    const trialEndsAt = new Date(trialCountFrom.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

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
      referredByCode: typeof referredByCode === "string" && referredByCode.trim() ? referredByCode.trim() : undefined,
      earlyAccessAnchor,
    });

    // Real login provisioning -- BusinessMember row, default vendor roles,
    // owner UserRole grant, staff slots. Never sends a NEW credentials
    // email here (the password above was already chosen by the vendor
    // themselves, so provisionVendorLogin's tempPassword branch is a
    // no-op) -- it only finalizes username=vendorId and the role/access
    // plumbing, same as every other activation path in this app.
    await provisionVendorLogin(vendor, String(user._id));

    // Scopes the trial itself to the chosen plan's modules (rate 0, no
    // invoice/payment) instead of leaving getVendorAvailableModules()
    // with no VendorSubscription at all -- that permissively grants FULL
    // unrestricted access with no plan ever having been chosen. Mirrors
    // activateVendorWithTrial's identical provisioning for the
    // apply-route instant-trial path -- see that function's own comment.
    const plan = findPlan("SC", requestedPlanKey) || findPlan("SC", "BASIC")!;
    await VendorSubscription.create({
      vendorId: vendor._id,
      businessId: resolvedBusinessId,
      modules: plan.vendorModuleKeys.map((key) => ({ key, rate: 0 })),
      validityDays: TRIAL_DAYS,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
      planKey: plan.key,
      planName: plan.name,
    });

    trackEvent("TRIAL_SIGNUP", {
      vendorId: vendor._id.toString(),
      businessId: String(resolvedBusinessId),
      planKey: plan.key,
    });

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

    notifyAdmins(
      `🆕 <b>New vendor signup</b>\n${companyName.trim()} (${vendorId})\n${normalizedEmail}\nAuto-activated, ${TRIAL_DAYS}-day trial started.`
    ).catch(() => {});

    // Previously this route sent NO email to the vendor themselves --
    // only admin-facing Telegram alerts, so a self-signed-up vendor had
    // no record anywhere of their own Vendor ID or where to log back in.
    sendWelcomeEmail({
      to: normalizedEmail,
      name: name.trim(),
      businessId: resolvedBusinessId || undefined,
      vendorId,
      loginId: vendorId,
      loginUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://crm.angroup.in"}/login`,
    }).catch(() => {});

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
