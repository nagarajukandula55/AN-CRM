import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import VendorProfile from "@/models/VendorProfile";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

/**
 * GET /api/vendor-subscriptions — admin-only list of every vendor
 * subscription (subVendorOf set), i.e. the trial/paid rows created by
 * services/vendorActivation.service.ts's activateVendorWithTrial (or any
 * future paid vendor plan). Joined with the vendor's company name/email
 * and the business's name for display -- see
 * src/app/console/vendor-subscriptions/page.tsx, the only consumer.
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

    const vendorIds = Array.from(new Set(subscriptions.map((s: any) => String(s.subVendorOf))));
    const businessIds = Array.from(new Set(subscriptions.map((s: any) => String(s.businessId))));

    const [vendors, businesses] = await Promise.all([
      VendorProfile.find({ _id: { $in: vendorIds } })
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

    return NextResponse.json({ success: true, subscriptions: rows });
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
