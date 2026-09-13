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

// A single request computing plan pricing for every tier x billing period
// (see api/vendor/plans) calls this same "global" document lookup a dozen+
// times -- it's one admin-controlled document that changes essentially
// never, so a short TTL collapses all of those into one real DB read.
const CUTOVER_CACHE_TTL_MS = 30_000;
let cutoverCache: { value: Date; expiresAt: number } | null = null;

export async function getEffectiveLaunchCutover(): Promise<Date> {
  const now = Date.now();
  if (cutoverCache && cutoverCache.expiresAt > now) return cutoverCache.value;

  const settings = await PricingSettings.findById("global").select("launchCutover").lean<any>();
  const value = settings?.launchCutover ? new Date(settings.launchCutover) : LAUNCH_PRICING_CUTOVER;
  cutoverCache = { value, expiresAt: now + CUTOVER_CACHE_TTL_MS };
  return value;
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
