/**
 * GET /api/subscriptions/status — current licensing state for the active
 * business: plan, days remaining, whether service should be considered
 * blocked. A business with no Subscription row at all is implicitly on
 * Basic's 7-day free trial, counted from Business.createdAt -- no row
 * needs pre-seeding for every new business to get a trial.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { PLANS_BY_MODE, type OperatingMode } from "@/core/pricing/plans";
import { getAllowedModuleKeys } from "@/core/pricing/planAccess";

const TRIAL_DAYS_DEFAULT = 15;

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.business?.businessId) {
      return NextResponse.json({ success: false, message: "No active business" }, { status: 400 });
    }

    await connectDB();

    const business = await Business.findById(session.business.businessId).select("operatingMode createdAt").lean<any>();
    const mode = ((business?.operatingMode || "SC") as OperatingMode);
    const modePlans = PLANS_BY_MODE[mode] || PLANS_BY_MODE.SC;
    const trialDays = modePlans.find((p) => p.key === "BASIC")?.freeTrialDays || TRIAL_DAYS_DEFAULT;

    const latest = await Subscription.findOne({
      businessId: session.business.businessId,
      subVendorOf: null,
      status: { $in: ["ACTIVE", "EXPIRED"] },
    })
      .sort({ createdAt: -1 })
      .lean<any>();

    if (latest) {
      const now = new Date();
      const expiry = new Date(latest.expiryDate);
      const daysRemaining = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / 86400000));
      const blocked = latest.status === "EXPIRED" || expiry.getTime() < now.getTime();
      return NextResponse.json({
        success: true,
        status: blocked ? "EXPIRED" : "ACTIVE",
        mode,
        plan: latest.plan,
        billingPeriod: latest.billingPeriod,
        expiryDate: latest.expiryDate,
        daysRemaining,
        blocked,
        moduleKeys: await getAllowedModuleKeys(mode, latest.plan),
      });
    }

    // No paid subscription ever -- implicit trial from business creation.
    const createdAt = business?.createdAt ? new Date(business.createdAt) : new Date();
    const trialEndsAt = new Date(createdAt);
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000));
    const blocked = trialEndsAt.getTime() < now.getTime();

    return NextResponse.json({
      success: true,
      status: blocked ? "EXPIRED" : "TRIAL",
      mode,
      plan: "BASIC",
      billingPeriod: null,
      expiryDate: trialEndsAt,
      daysRemaining,
      blocked,
      moduleKeys: await getAllowedModuleKeys(mode, "BASIC"),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
