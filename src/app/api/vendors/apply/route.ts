import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import Business from "@/models/Business";
import User from "@/models/User";
import { Types } from "mongoose";
import { generateGlobalDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { notifySuperAdmins } from "@/services/notification.service";
import { activateVendorWithTrial } from "@/services/vendorActivation.service";
import { sendGenericEmail } from "@/services/email/resend.service";
import { renderEmailShell, emailInfoBox } from "@/services/email/emailShell";
import { getVendorOnboardingConfig, getPlatformBusinessId } from "@/lib/centralApiRead";
import { sendTelegramMessage } from "@/lib/telegram";
import type { PlanKey } from "@/core/pricing/plans";

const VALID_PLAN_KEYS: PlanKey[] = ["BASIC", "PRO", "ULTIMATE"];

/**
 * POST /api/vendors/apply — PUBLIC vendor signup request.
 *
 * Previously required a businessId in the request (the admin had to share
 * a link like /vendor-apply?businessId=... pointed at one specific
 * business). That doesn't fit a general "raise a vendor signup request"
 * flow where the prospective vendor doesn't know or choose which business
 * they're being onboarded under — the admin now assigns that at approval
 * time (see /api/vendors/[id]/review's APPROVE handler, which accepts a
 * businessId in its body and sets it there for the first time).
 *
 * businessId is still ACCEPTED here (optional) so the existing
 * link-based flow (/vendor-apply?businessId=...) keeps working exactly as
 * before for admins who prefer to pre-target one business — this route
 * just no longer REQUIRES it.
 *
 * Every application gets a requestNumber immediately so the applicant has
 * something to reference/quote while waiting for review, independent of
 * vendorId (which historically doubles as the operational vendor ID and
 * needs a businessId-aware numbering config that may not exist yet for an
 * unassigned application).
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    const {
      businessId,
      userId,
      companyName,
      contactPerson,
      email,
      phone,
      gstRegistered,
      gstNumber,
      panNumber,
      category,
      businessType,
      appliedAs,
      address,
      bankDetails,
      documents,
      notes,
      planKey,
    } = body;

    if (!companyName || !contactPerson || !email || !phone) {
      return NextResponse.json(
        { success: false, message: "Company name, contact person, email and phone are required" },
        { status: 400 }
      );
    }

    // A vendor application must be tied to an already-registered User
    // account (created via /register beforehand) rather than minting one
    // inline -- the applicant supplies that account's User ID here, and it
    // must actually exist. This also means finalize/route.ts's "create a
    // user with a temp password" branch is now the fallback path for
    // legacy applications, not the norm.
    if (!userId || !String(userId).trim()) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Please register an account first at /register, then enter your User ID here.",
        },
        { status: 400 }
      );
    }
    const normalizedUserId = String(userId).toLowerCase().trim();
    const applicantUser = await User.findOne({
      username: normalizedUserId,
      isDeleted: { $ne: true },
    })
      .select("_id email")
      .lean();
    if (!applicantUser) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No registered account found with that User ID. Please register first at /register, then apply with the User ID you were given.",
        },
        { status: 404 }
      );
    }

    // GST rule: a GST-registered vendor must supply a GSTIN; a without-GST
    // vendor must supply PAN instead.
    if (gstRegistered && !gstNumber) {
      return NextResponse.json(
        { success: false, message: "GSTIN is required for GST-registered vendors" },
        { status: 400 }
      );
    }
    if (!gstRegistered && !panNumber) {
      return NextResponse.json(
        { success: false, message: "PAN is required for vendors without GST registration" },
        { status: 400 }
      );
    }

    // A caller-supplied businessId (the existing link-based flow) still
    // wins if present. Otherwise -- the normal case for a public /vendor-
    // apply signup -- resolve AN-CRM's own self-representing Business
    // (every vendor who signs up here belongs under it) via central-api's
    // platform-business registry FIRST (admin-editable live, no redeploy
    // needed when it drifts -- see routes/platformBusiness.js), falling
    // back to the AN_CRM_MY_BIZ_FLOW_BUSINESS_ID env var only if
    // central-api is unreachable or that app isn't registered there yet.
    // Per explicit direction: which business a signup lands under is
    // determined by WHICH SITE they signed up on, not left for an admin to
    // assign later. Falls through to the old "unassigned, admin picks at
    // approval" behavior only if neither source has anything.
    // .trim() -- a copy-pasted env var value with a trailing space/newline
    // is invisible in most dashboard UIs but fails Types.ObjectId.isValid()
    // (or resolves to a nonexistent id), reproduced in production tonight
    // with the same class of bug on SUPER_ADMIN_BOOTSTRAP_SECRET.
    let resolvedBusinessId =
      businessId ||
      (await getPlatformBusinessId("an-crm")) ||
      process.env.AN_CRM_MY_BIZ_FLOW_BUSINESS_ID?.trim();

    let business: { _id: unknown; name?: string; brandName?: string; marketplace?: { skipVendorApproval?: boolean } } | null = null;
    if (resolvedBusinessId) {
      if (!Types.ObjectId.isValid(resolvedBusinessId)) {
        return NextResponse.json(
          { success: false, message: "Invalid businessId in link" },
          { status: 400 }
        );
      }
      business = await (Business as any)
        .findOne({ _id: resolvedBusinessId, isActive: true })
        .select("_id name brandName marketplace.skipVendorApproval")
        .lean();
    }
    // Self-healing fallback: only for the no-businessId-in-link public
    // signup path (never for an explicit ?businessId= link, where a wrong
    // id should stay a hard error) -- if AN_CRM_MY_BIZ_FLOW_BUSINESS_ID is
    // stale/missing/points at a since-deactivated record, look up this
    // app's own self-representing business directly instead of hard-
    // failing every public signup. Keyed on `isPlatform: true` (a stable
    // structural flag), NOT on the literal name "My Biz Flow" -- that name
    // is just branding and has already drifted in production (the actual
    // record is currently named "AN-CRM Platform"), so a name-based lookup
    // would silently never match. This exact failure mode has bitten
    // production before (env var drift across a redeploy, or the record's
    // isActive getting flipped) -- see scripts/fixLocalMyBizFlowBusiness.ts
    // for the one-time DB-side fix; this is the request-time safety net so
    // a signup never 404s while that's sorted out.
    if (!business && !businessId) {
      business = await (Business as any)
        .findOne({ isPlatform: true, isActive: true })
        .select("_id name brandName marketplace.skipVendorApproval")
        .lean();
      if (business) {
        resolvedBusinessId = String((business as any)._id);
        const warning = `[vendors/apply] AN_CRM_MY_BIZ_FLOW_BUSINESS_ID lookup failed (env value: ${process.env.AN_CRM_MY_BIZ_FLOW_BUSINESS_ID || "unset"}) -- fell back to the platform business by isPlatform flag ("${(business as any).name}", ${resolvedBusinessId}). Update the env var to stop relying on this fallback.`;
        console.warn(warning);
        sendTelegramMessage(`⚠️ <b>Signup fallback engaged</b>\n${warning}`).catch(() => {});
      }
    }
    if (resolvedBusinessId && !business) {
      return NextResponse.json(
        { success: false, message: "Business not found or inactive" },
        { status: 404 }
      );
    }

    // One live application per email (scoped to the target business when
    // one was pre-selected via the link; otherwise scoped globally, since
    // an unassigned application has no business to scope to yet).
    const dupeQuery: Record<string, unknown> = {
      email: String(email).toLowerCase().trim(),
      isDeleted: false,
      status: { $nin: ["REJECTED", "INACTIVE"] },
    };
    if (business) dupeQuery.businessId = new Types.ObjectId(resolvedBusinessId);
    else dupeQuery.businessId = null;
    const existing = await VendorProfile.findOne(dupeQuery).lean();
    if (existing) {
      return NextResponse.json(
        { success: false, message: "An application with this email already exists" },
        { status: 409 }
      );
    }

    // requestNumber — always generated, independent of businessId.
    const { value: requestNumber } = await generateGlobalDocumentNumber("VENDOR_REQUEST", null);

    // vendorId — only generated now if a business was pre-selected (so the
    // existing link-based flow behaves exactly as before). For a general
    // unassigned application, vendorId is generated later at APPROVE time
    // once a business is actually chosen (see review/route.ts).
    let vendorId: string | undefined;
    if (business) {
      const generated = await generateGlobalDocumentNumber("VENDOR", resolvedBusinessId);
      vendorId = generated.value;
    }

    const vendor = await VendorProfile.create({
      businessId: business ? new Types.ObjectId(resolvedBusinessId) : null,
      userId: (applicantUser as any)._id,
      vendorId,
      requestNumber,
      companyName: String(companyName).trim(),
      contactPerson: String(contactPerson).trim(),
      email: String(email).toLowerCase().trim(),
      phone: String(phone).trim(),
      gstRegistered: !!gstRegistered,
      gstNumber: gstNumber ? String(gstNumber).toUpperCase().trim() : undefined,
      panNumber: panNumber ? String(panNumber).toUpperCase().trim() : undefined,
      category,
      businessType,
      // SC (Service Center) is the only vendor type this platform supports
      // now -- BRAND and POS were removed. Any other value submitted is
      // silently dropped rather than accepted, same as before.
      appliedAs: appliedAs === "SC" ? appliedAs : undefined,
      address,
      bankDetails,
      documents,
      notes,
      status: "APPLIED",
      isApproved: false,
    });

    logAction({
      action: "CREATE",
      entity: "VendorProfile",
      entityId: vendor._id?.toString(),
      after: vendor,
      req,
    });

    // Per explicit direction, a vendor's username is their Vendor ID and
    // NOTHING else -- previously that only got set at final activation
    // (provisionVendorLogin, for the instant-SC path), so a BRAND/POS
    // applicant still pending review kept logging in with the random ID
    // /api/auth/register generated at account-creation time, before a
    // vendorId even existed. Now that a vendorId IS assigned immediately
    // whenever a business resolves (see above), sync it onto the User
    // record right away too -- applies to every application, not just the
    // ones that get instantly activated.
    if (vendor.vendorId) {
      await User.findByIdAndUpdate(applicantUser._id, { username: vendor.vendorId.toLowerCase() }).catch((err) => {
        console.error("[vendors/apply] failed to sync username to vendorId:", err?.message || err);
      });
    }

    // Skip-approval instant-trial path: only possible when a business was
    // actually resolved (it's a per-business toggle). Central-api is now
    // the single source of truth for this setting (its own dashboard's
    // Access tab), shared across every consuming app -- checked first;
    // Business.marketplace.skipVendorApproval (local) is only the
    // fallback for when central-api is unreachable/not yet configured for
    // this business, not the primary store anymore. Runs inline,
    // synchronously, right here -- it must never fail the request itself,
    // since the VendorProfile above is already saved either way.
    let trialActivated = false;
    let skipApproval = business?.marketplace?.skipVendorApproval || false;
    if (resolvedBusinessId) {
      const centralConfig = await getVendorOnboardingConfig(String(resolvedBusinessId));
      console.log(
        "[vendors/apply] skip-approval check — resolvedBusinessId:", String(resolvedBusinessId),
        "| central config found:", !!centralConfig,
        "| central skipVendorApproval:", centralConfig?.skipVendorApproval,
        "| local fallback skipVendorApproval:", business?.marketplace?.skipVendorApproval
      );
      if (centralConfig) skipApproval = centralConfig.skipVendorApproval;
    }
    // Instant, no-approval activation is SC-only -- SC is the only vendor
    // type this platform supports now (BRAND/POS were removed). The
    // per-business skipVendorApproval toggle above still governs WHETHER
    // SC gets this (an admin can still require review for SC too), but it
    // can never auto-activate an application with no (or a non-SC)
    // appliedAs.
    if (skipApproval && appliedAs !== "SC") {
      skipApproval = false;
    }
    if (skipApproval) {
      try {
        const requestedPlanKey: PlanKey | undefined = VALID_PLAN_KEYS.includes(planKey) ? planKey : undefined;
        const result = await activateVendorWithTrial(vendor as any, String(resolvedBusinessId), { skipAgreement: true, planKey: requestedPlanKey });
        trialActivated = result.ok;
        if (!result.ok) {
          console.error("Instant vendor trial activation failed:", result.error);
        }
      } catch (err: unknown) {
        console.error(
          "Instant vendor trial activation threw:",
          err instanceof Error ? err.message : err
        );
      }
    }

    // Applicant-facing confirmation -- previously only super admins got
    // notified; the applicant themselves never received anything, so
    // there was no record they could point to that the submission actually
    // went through. Fire-and-forget, same as every other email send in
    // this flow -- must never fail the request.
    if (vendor.email) {
      sendGenericEmail({
        to: vendor.email,
        subject: trialActivated
          ? "Your partner application was approved — check your inbox for the agreement"
          : `We received your partner application — ${requestNumber}`,
        html: trialActivated
          ? renderEmailShell({
              heading: "Your application was approved",
              previewText: `Request ${requestNumber} approved — your trial has started.`,
              bodyHtml: `
                <p>Hi ${String(contactPerson).trim()},</p>
                <p>Thanks for applying to become a partner${business ? ` with ${business.brandName || business.name}` : ""}. Your application was approved instantly.</p>
                ${emailInfoBox([{ label: "Request number", value: requestNumber }])}
                <p style="font-size:13px;color:#8B8F94;">You should receive a separate email shortly with your partner agreement to sign, and another with your portal login details. Your 7-day trial has already started.</p>
              `,
            })
          : renderEmailShell({
              heading: "We've received your application",
              previewText: `Request ${requestNumber} is under review.`,
              bodyHtml: `
                <p>Hi ${String(contactPerson).trim()},</p>
                <p>Thanks for applying to become a partner${business ? ` with ${business.brandName || business.name}` : ""}. We've received your application.</p>
                ${emailInfoBox([{ label: "Request number", value: requestNumber }])}
                <p style="font-size:13px;color:#8B8F94;">Please quote your request number in any follow-up. Our team will review your details and contact you with the partner agreement.</p>
              `,
            }),
        businessId: resolvedBusinessId ? String(resolvedBusinessId) : undefined,
        // Only the "under review" branch maps to a configurable occasion --
        // the instant-trial-activation branch has its own distinct wording
        // not covered by this catalog entry yet.
        ...(!trialActivated
          ? { templateKey: "VENDOR_APPLICATION_RECEIVED", templateTokens: { vendorName: String(contactPerson).trim(), businessName: business?.brandName || business?.name || "" } }
          : {}),
      }).catch((err) => console.error("Vendor application confirmation email failed:", err));
    }

    await notifySuperAdmins({
      title: trialActivated ? "New vendor auto-activated (trial)" : "New vendor application",
      message: `${String(companyName).trim()} applied (request ${requestNumber})${
        trialActivated ? " and was auto-activated on a 7-day trial" : " and needs review"
      }${business ? ` for ${business.brandName || business.name}` : ""}.`,
      type: "warning",
      link: trialActivated ? "/console/admin/vendor-subscriptions" : "/console/admin/vendors",
    });

    sendTelegramMessage(
      `🆕 <b>Vendor application received</b>\n${String(companyName).trim()} (${appliedAs || "?"}) — ${requestNumber}${
        business ? ` for ${business.brandName || business.name}` : ""
      }`
    ).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        message: trialActivated
          ? "Application submitted and approved instantly — check your email for your partner agreement (to sign) and your portal login details. Your 7-day trial has started."
          : business
          ? "Application submitted successfully. The team will review your details and contact you for the partner agreement."
          : `Application submitted successfully. Your request number is ${requestNumber} — please quote it in any follow-up. The team will review your documents, assign you to the appropriate business, and contact you for the partner agreement.`,
        applicationId: vendor.vendorId || requestNumber,
        requestNumber,
        business: business?.brandName || business?.name,
        trialActivated,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}