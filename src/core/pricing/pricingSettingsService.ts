/**
 * Server-only DB-aware pricing helpers -- mirrors the pure/static formulas
 * in core/pricing/plans.ts (which stays import-safe from client bundles,
 * e.g. the public /pricing page) but resolves the launch->standard
 * cutover date from PricingSettings when a Super Admin has overridden it,
 * falling back to plans.ts's compiled LAUNCH_PRICING_CUTOVER otherwise.
 * Use these (not the sync plans.ts versions) anywhere actual money or a
 * public price display is computed server-side.
 */
import PricingSettings from "@/models/PricingSettings";
import { LAUNCH_PRICING_CUTOVER, BILLING_PERIODS, type Plan, type BillingPeriod } from "@/core/pricing/plans";

export async function getEffectiveLaunchCutover(): Promise<Date> {
  const settings = await PricingSettings.findById("global").select("launchCutover").lean<any>();
  return settings?.launchCutover ? new Date(settings.launchCutover) : LAUNCH_PRICING_CUTOVER;
}

export async function isLaunchPricingActiveAsync(now: Date = new Date()): Promise<boolean> {
  const cutover = await getEffectiveLaunchCutover();
  return now.getTime() < cutover.getTime();
}

export async function currentMonthlyRateAsync(plan: Plan, now: Date = new Date()): Promise<number> {
  return (await isLaunchPricingActiveAsync(now)) ? plan.launchPriceINR : plan.monthlyPriceINR;
}

export async function priceForPeriodAsync(
  plan: Plan,
  period: BillingPeriod,
  now: Date = new Date()
): Promise<{ total: number; perMonth: number; discountPct: number }> {
  const p = BILLING_PERIODS.find((b) => b.key === period) || BILLING_PERIODS[0];
  const baseRate = await currentMonthlyRateAsync(plan, now);
  const fullPrice = baseRate * p.months;
  const total = Math.round(fullPrice * (1 - p.discountPct / 100));
  const perMonth = Math.round(total / p.months);
  return { total, perMonth, discountPct: p.discountPct };
}
