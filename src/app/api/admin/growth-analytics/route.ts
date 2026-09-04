import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import AnalyticsEvent from "@/models/AnalyticsEvent";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

/**
 * GET /api/admin/growth-analytics — AN Group's own commercial-funnel
 * numbers (pricing views, trial signups, checkout starts, payments,
 * upgrades, renewals, founding vs standard split). Super Admin only --
 * see models/AnalyticsEvent.ts's own comment on why this is a separate
 * concern from any vendor's own business analytics.
 */
export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super Admin only" }, { status: 403 });
    }
    await connectDB();

    const [counts, byPlan, foundingVsStandard, revenueByFounding, recent] = await Promise.all([
      AnalyticsEvent.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]),
      AnalyticsEvent.aggregate([
        { $match: { type: { $in: ["TRIAL_SIGNUP", "PAYMENT_COMPLETED", "RENEWAL", "UPGRADE"] } } },
        { $group: { _id: { type: "$type", planKey: "$planKey" }, count: { $sum: 1 } } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { type: { $in: ["PAYMENT_COMPLETED", "RENEWAL", "UPGRADE"] } } },
        { $group: { _id: "$isFoundingPricing", count: { $sum: 1 } } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { type: { $in: ["PAYMENT_COMPLETED", "RENEWAL", "UPGRADE"] } } },
        { $group: { _id: "$isFoundingPricing", revenue: { $sum: "$amount" } } },
      ]),
      AnalyticsEvent.find({}).sort({ createdAt: -1 }).limit(50).select("type planKey billingPeriod amount isFoundingPricing createdAt").lean(),
    ]);

    const countsByType: Record<string, number> = {};
    for (const c of counts) countsByType[c._id] = c.count;

    const trialSignups = countsByType.TRIAL_SIGNUP || 0;
    const paidConversions = (countsByType.PAYMENT_COMPLETED || 0);
    const trialToPaidConversionPct = trialSignups > 0 ? Math.round((paidConversions / trialSignups) * 1000) / 10 : null;

    return NextResponse.json({
      success: true,
      countsByType,
      byPlan,
      foundingVsStandard,
      revenueByFounding,
      trialToPaidConversionPct,
      recent,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
