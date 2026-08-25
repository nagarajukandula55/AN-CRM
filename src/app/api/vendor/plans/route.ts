import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { PLANS_BY_MODE, BILLING_PERIODS, currentMonthlyRate, priceForPeriod, isLaunchPricingActive, type OperatingMode } from "@/core/pricing/plans";
import { getEffectivePlan } from "@/core/pricing/planAccess";

// GET /api/vendor/plans — the BASIC/PRO/ULTIMATE catalog for THIS vendor's
// own operating mode (SC/BRAND/POS), for the vendor to pick from on their
// Billing page -- the same catalog (core/pricing/plans.ts, with any
// Super-Admin PlanFeatureConfig override applied) that drives /pricing and
// module gating. There is no separate self-serve-only plan catalog.
export async function GET(_req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const vendor = ctx.vendor as any;
    const business = vendor.businessId
      ? await Business.findById(vendor.businessId).select("operatingMode").lean()
      : null;
    const mode = ((business as any)?.operatingMode || "SC") as OperatingMode;

    const tiers = PLANS_BY_MODE[mode] || PLANS_BY_MODE.SC;
    const plans = await Promise.all(
      tiers.map(async (t) => {
        const effective = (await getEffectivePlan(mode, t.key)) || t;
        return {
          key: effective.key,
          name: effective.name,
          tagline: effective.tagline,
          // The rate actually charged right now (launch or standard,
          // whichever is active) at MONTHLY billing -- see
          // currentMonthlyRate's own comment. periods[] below covers
          // every other billing-period option and its discounted total.
          monthlyPriceINR: currentMonthlyRate(effective),
          periods: BILLING_PERIODS.map((p) => ({ key: p.key, label: p.label, months: p.months, ...priceForPeriod(effective, p.key) })),
          seatLimit: effective.seatLimit,
          features: effective.features,
          highlight: effective.highlight || false,
        };
      })
    );

    return NextResponse.json({ success: true, plans, launchPricingActive: isLaunchPricingActive() });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
