import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { PLANS_BY_MODE, BILLING_PERIODS } from "@/core/pricing/plans";
import { getEffectivePlan } from "@/core/pricing/planAccess";
import { currentMonthlyRateAsync, priceForPeriodAsync, isLaunchPricingActiveAsync } from "@/core/pricing/pricingSettingsService";

/**
 * GET /api/pricing/config — public, unauthenticated. The live, admin-
 * overridable numbers for every SC plan, for the public marketing pages
 * (/pricing, home page pricing snapshot) to render instead of importing
 * the static defaults from core/pricing/plans.ts directly. Without this,
 * a Super Admin's PlanFeatureConfig price override (already applied to
 * the vendor's own billing page via /api/vendor/plans) never showed up on
 * the PUBLIC pricing page at all -- the site would advertise one price
 * while actually charging another.
 */
export async function GET() {
  try {
    await connectDB();
    const tiers = PLANS_BY_MODE.SC;
    const plans = await Promise.all(
      tiers.map(async (t) => {
        const effective = (await getEffectivePlan("SC", t.key)) || t;
        return {
          key: effective.key,
          monthlyPriceINR: await currentMonthlyRateAsync(effective),
          seatLimit: effective.seatLimit,
          freeTrialDays: effective.freeTrialDays,
          periods: await Promise.all(
            BILLING_PERIODS.map(async (p) => ({
              key: p.key,
              ...(await priceForPeriodAsync(effective, p.key)),
            }))
          ),
        };
      })
    );
    return NextResponse.json({ success: true, plans, launchPricingActive: await isLaunchPricingActiveAsync() });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
