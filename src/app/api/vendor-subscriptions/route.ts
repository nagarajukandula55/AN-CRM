import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import VendorProfile from "@/models/VendorProfile";
import VendorSubscription from "@/models/VendorSubscription";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

/**
 * GET /api/vendor-subscriptions — admin-only list of every vendor
 * trial/subscription, merged from TWO independent mechanisms (see
 * lib/vendor/checkTrialAccess.ts's own comment on why both exist):
 *
 *  1. Subscription docs with subVendorOf set -- the instant-trial rows
 *     created by services/vendorActivation.service.ts's
 *     activateVendorWithTrial (only for businesses with
 *     marketplace.skipVendorApproval on).
 *  2. VendorProfile.trialEndsAt -- the universal trial EVERY self-signed-up
 *     vendor gets (api/vendors/self-signup), with no Subscription row at
 *     all. These used to be entirely invisible/uneditable on this admin
 *     page -- an admin extending a vendor's trial here had NO EFFECT for
 *     any self-signup vendor, since there was nothing here to edit for
 *     them ("few of my users facing this issue"). Synthesized into rows
 *     with id `vp_<vendorProfileId>` so PATCH can target them.
 *
 * A vendor with BOTH (rare) shows only the real Subscription row -- that
 * mechanism takes priority in checkTrialAccess.ts too.
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("businesses", "view"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    const subscriptions = await (Subscription as any)
      .find({ subVendorOf: { $ne: null } })
      .sort({ createdAt: -1 })
      .lean();

    const subVendorIds = new Set(subscriptions.map((s: any) => String(s.subVendorOf)));

    // Self-signup vendors with a trialEndsAt and no legacy Subscription row.
    const selfSignupVendors = await VendorProfile.find({
      trialEndsAt: { $ne: null },
      _id: { $nin: Array.from(subVendorIds) },
    })
      .select("companyName email contactPerson businessId trialEndsAt createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const vendorSubs = await VendorSubscription.find({
      vendorId: { $in: selfSignupVendors.map((v: any) => v._id) },
    })
      .select("vendorId currentPeriodEnd planKey")
      .lean();
    const vendorSubMap = new Map(vendorSubs.map((vs: any) => [String(vs.vendorId), vs]));

    const virtualRows = selfSignupVendors.map((v: any) => {
      const vs = vendorSubMap.get(String(v._id));
      const now = Date.now();
      const trialEndsAt = v.trialEndsAt;
      const isPaid = !!vs?.planKey && vs.currentPeriodEnd && new Date(vs.currentPeriodEnd).getTime() > now;
      const trialLive = trialEndsAt && new Date(trialEndsAt).getTime() > now;
      return {
        _id: `vp_${v._id}`,
        status: isPaid ? "ACTIVE" : trialLive ? "TRIAL" : "EXPIRED",
        plan: vs?.planKey || "BASIC",
        billingPeriod: "MONTHLY",
        trialEndsAt,
        expiryDate: vs?.currentPeriodEnd || trialEndsAt,
        vendor: { _id: v._id, companyName: v.companyName, email: v.email, contactPerson: v.contactPerson },
        business: null,
        isSelfSignup: true,
      };
    });

    const businessIds = Array.from(new Set(subscriptions.map((s: any) => String(s.businessId))));

    const [vendors, businesses] = await Promise.all([
      VendorProfile.find({ _id: { $in: Array.from(subVendorIds) } })
        .select("companyName email contactPerson")
        .lean(),
      (Business as any).find({ _id: { $in: businessIds } }).select("name brandName").lean() as Promise<any[]>,
    ]);

    const vendorMap = new Map(vendors.map((v: any) => [String(v._id), v]));
    const businessMap = new Map(businesses.map((b: any) => [String(b._id), b]));

    const rows = subscriptions.map((s: any) => {
      const vendor = vendorMap.get(String(s.subVendorOf));
      const business = businessMap.get(String(s.businessId));
      return {
        ...s,
        vendor: vendor
          ? { _id: vendor._id, companyName: vendor.companyName, email: vendor.email, contactPerson: vendor.contactPerson }
          : null,
        business: business ? { _id: business._id, name: business.brandName || business.name } : null,
      };
    });

    return NextResponse.json({ success: true, subscriptions: [...rows, ...virtualRows] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/vendor-subscriptions — admin-initiated manual creation of a
 * vendor subscription row (subVendorOf set), for a vendor that doesn't
 * already have one (e.g. the instant-trial flow never ran for them, or an
 * admin wants to manually grant/record a plan). Mirrors the field shape
 * activateVendorWithTrial's Subscription row uses, but is a plain create
 * here since this is a manual admin action, not an activation flow. Gated
 * the same as PATCH /api/vendor-subscriptions/[id] (businesses.edit).
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("businesses", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }
    const userId = session.user.id;

    const body = await req.json();
    const { vendorId, status, trialEndsAt, expiryDate, plan, billingPeriod, mode, amount } = body;

    if (!vendorId) {
      return NextResponse.json({ success: false, error: "vendorId is required" }, { status: 400 });
    }

    const vendor = await VendorProfile.findById(vendorId).select("businessId companyName").lean();
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
    }
    if (!(vendor as any).businessId) {
      return NextResponse.json({ success: false, error: "Vendor has no business assigned" }, { status: 400 });
    }

    const subscription = await (Subscription as any).create({
      businessId: (vendor as any).businessId,
      subVendorOf: vendorId,
      mode: mode && ["BRAND", "SC", "POS"].includes(mode) ? mode : "BRAND",
      plan: plan && ["BASIC", "PRO", "ULTIMATE"].includes(plan) ? plan : "BASIC",
      billingPeriod: billingPeriod && ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"].includes(billingPeriod) ? billingPeriod : "MONTHLY",
      status: status && ["TRIAL", "PENDING_PAYMENT", "ACTIVE", "EXPIRED", "CANCELLED"].includes(status) ? status : "TRIAL",
      amount: typeof amount === "number" && amount >= 0 ? amount : 0,
      startDate: new Date(),
      trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : undefined,
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      createdBy: userId,
    });

    logAction({
      action: "CREATE",
      entity: "Subscription",
      entityId: subscription._id.toString(),
      after: subscription,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, subscription }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
