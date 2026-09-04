import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import AnalyticsEvent from "@/models/AnalyticsEvent";
import VendorProfile from "@/models/VendorProfile";
import VendorSubscription from "@/models/VendorSubscription";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

/**
 * GET /api/admin/growth-analytics — AN Group's own commercial-funnel
 * numbers (pricing views, trial signups, checkout starts, payments,
 * upgrades, renewals, founding vs standard split) PLUS a live snapshot of
 * the current vendor base itself (status/plan distribution, signup trend,
 * churn signal) -- per explicit direction ("it should also show current
 * vendors and their status etc, cover maximum thing where i can track
 * growth or decline"). Super Admin only -- see models/AnalyticsEvent.ts's
 * own comment on why the funnel numbers are a separate concern from any
 * vendor's own business analytics; the vendor-snapshot numbers below read
 * straight off VendorProfile/VendorSubscription, not the event log, so
 * they're accurate even for vendors created before event tracking existed.
 */
export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super Admin only" }, { status: 403 });
    }
    await connectDB();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      counts, byPlan, foundingVsStandard, revenueByFounding, recent,
      vendorStatusCounts, subscriptionStatusCounts, planDistribution,
      signupsByMonth, totalVendors, newThisMonth, recentlyExpired, recentlyLost,
    ] = await Promise.all([
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

      // Live vendor headcount by VendorProfile.status (APPLIED/PENDING/
      // ACTIVE/SUSPENDED/etc) -- the actual current state of the vendor
      // base, not a funnel event count.
      VendorProfile.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      // Billing status per vendor, replicating computeStatus() in
      // billing.service.ts (NOT_SET/UNPAID/ACTIVE/EXPIRED) via aggregation
      // so this is one query instead of loading every subscription into JS.
      VendorSubscription.aggregate([
        {
          $addFields: {
            _computedStatus: {
              $switch: {
                branches: [
                  { case: { $eq: [{ $size: { $ifNull: ["$modules", []] } }, 0] }, then: "NOT_SET" },
                  { case: { $eq: ["$currentPeriodEnd", null] }, then: "UNPAID" },
                  { case: { $gt: ["$currentPeriodEnd", now] }, then: "ACTIVE" },
                ],
                default: "EXPIRED",
              },
            },
          },
        },
        { $group: { _id: "$_computedStatus", count: { $sum: 1 } } },
      ]),
      // Plan distribution among currently-ACTIVE (paid-through-today)
      // subscriptions only -- an expired Pro vendor shouldn't inflate
      // Pro's live headcount.
      VendorSubscription.aggregate([
        { $match: { currentPeriodEnd: { $gt: now } } },
        { $group: { _id: "$planKey", count: { $sum: 1 } } },
      ]),
      // Signup trend, last 6 months -- the actual growth/decline curve.
      VendorProfile.aggregate([
        { $match: { isDeleted: { $ne: true }, createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      VendorProfile.countDocuments({ isDeleted: { $ne: true } }),
      VendorProfile.countDocuments({ isDeleted: { $ne: true }, createdAt: { $gte: startOfMonth } }),
      // Churn signal #1: paid subscriptions that lapsed in the last 30 days
      // (were ACTIVE, now past currentPeriodEnd) and haven't renewed since.
      VendorSubscription.countDocuments({
        currentPeriodEnd: { $gte: thirtyDaysAgo, $lt: now },
      }),
      // Churn signal #2: vendors an admin actually marked lost in the last
      // 30 days (SUSPENDED/INACTIVE/REJECTED), independent of billing.
      VendorProfile.countDocuments({
        isDeleted: { $ne: true },
        status: { $in: ["SUSPENDED", "INACTIVE", "REJECTED"] },
        updatedAt: { $gte: thirtyDaysAgo },
      }),
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
      vendorSnapshot: {
        totalVendors,
        newThisMonth,
        statusCounts: vendorStatusCounts,
        subscriptionStatusCounts,
        planDistribution,
        signupsByMonth,
        recentlyExpiredSubscriptions: recentlyExpired,
        recentlyLostVendors: recentlyLost,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
