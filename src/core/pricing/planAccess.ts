/**
 * Resolves what a business's ACTUAL plan is (from its Subscription, same
 * "no row = trial on Basic" rule as core/subscriptions/checkAccess.ts) and
 * which module keys that plan unlocks (DB override in PlanFeatureConfig,
 * falling back to the static default on the Plan itself).
 *
 * Used to gate module visibility on top of the existing permission system
 * -- see api/ui/sidebar/route.ts and the Telegram business report cron.
 * Super Admin always bypasses this (checked by the caller, not here).
 */
import Subscription from "@/models/Subscription";
import PlanFeatureConfig from "@/models/PlanFeatureConfig";
import { findPlan, type OperatingMode, type PlanKey, type Plan } from "@/core/pricing/plans";

export async function getActivePlanKey(businessId: string): Promise<PlanKey> {
  const latest = await Subscription.findOne({
    businessId,
    subVendorOf: null,
    subBusinessOf: null,
    status: { $in: ["ACTIVE", "EXPIRED"] },
  })
    .sort({ createdAt: -1 })
    .select("plan")
    .lean<any>();
  return (latest?.plan as PlanKey) || "BASIC";
}

export async function getAllowedModuleKeys(mode: OperatingMode, plan: PlanKey): Promise<string[] | null> {
  const override = await PlanFeatureConfig.findOne({ mode, plan }).select("moduleKeys").lean<any>();
  if (override) return override.moduleKeys || [];
  const def = findPlan(mode, plan);
  return def?.moduleKeys ?? null; // null = no allowlist known, caller should not filter
}

/** Convenience: resolves a business's own plan + allowed keys in one call. */
export async function getAllowedModuleKeysForBusiness(businessId: string, mode: OperatingMode): Promise<string[] | null> {
  const plan = await getActivePlanKey(businessId);
  return getAllowedModuleKeys(mode, plan);
}

/**
 * The static Plan from plans.ts with any Super-Admin price/seatLimit/
 * trial override (PlanFeatureConfig) applied on top -- the money-critical
 * path (order creation, payment verification) must use this instead of
 * findPlan() directly, or an admin-edited price silently never takes
 * effect on actual charges.
 */
export async function getEffectivePlan(mode: OperatingMode, plan: PlanKey): Promise<Plan | undefined> {
  const def = findPlan(mode, plan);
  if (!def) return undefined;
  const override = await PlanFeatureConfig.findOne({ mode, plan })
    .select("monthlyPriceINR seatLimit freeTrialDays moduleKeys")
    .lean<any>();
  if (!override) return def;
  return {
    ...def,
    // A Super Admin manually setting a price here is a deliberate override
    // of BOTH the launch and the standard rate -- it always wins, bypassing
    // the automatic launch->standard hike entirely (that auto-hike exists
    // to avoid needing an admin action; an admin who acted anyway clearly
    // wants their own number to stick, not to be silently reverted at the
    // next cutover).
    monthlyPriceINR: override.monthlyPriceINR ?? def.monthlyPriceINR,
    launchPriceINR: override.monthlyPriceINR ?? def.launchPriceINR,
    seatLimit: override.seatLimit ?? def.seatLimit,
    freeTrialDays: override.freeTrialDays ?? def.freeTrialDays,
    moduleKeys: override.moduleKeys ?? def.moduleKeys,
  };
}
