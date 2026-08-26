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
import VendorSubscription from "@/models/VendorSubscription";
import { computeStatus } from "@/core/billing/billing.service";
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
    .select("monthlyPriceINR seatLimit freeTrialDays moduleKeys vendorModuleKeys")
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
    // vendorModuleKeys is what api/vendor/billing/subscribe actually reads
    // to populate a paying vendor's VendorSubscription.modules -- without
    // this, an admin's edit here would change the console sidebar but do
    // nothing for the vendor portal, which is the vocabulary that matters
    // for almost everything built this session.
    vendorModuleKeys: override.vendorModuleKeys?.length ? override.vendorModuleKeys : def.vendorModuleKeys,
  };
}

/**
 * A VENDOR's own active plan tier -- distinct from getActivePlanKey above,
 * which reads the shared platform Business's legacy Subscription record.
 * Every self-signed-up vendor shares ONE platform Business (see
 * VendorProfile's own comment on why telegram fields/terms moved off
 * Business), so that Business-level plan is either unset or shared across
 * every vendor on the platform -- checking it for a per-vendor feature gate
 * meant a vendor given Ultimate via their own VendorSubscription (the real,
 * current per-vendor billing mechanism -- see api/vendor/billing/subscribe)
 * still failed every plan-gated check, since VendorSubscription was never
 * consulted at all. Falls back to null (caller should treat as "no active
 * plan known") when the vendor has no VendorSubscription row yet.
 */
export async function getVendorPlanKey(vendorId: string): Promise<PlanKey | null> {
  const sub = await VendorSubscription.findOne({ vendorId }).select("planKey currentPeriodEnd modules").lean<any>();
  if (!sub) return null;
  if (computeStatus(sub) !== "ACTIVE") return null;
  return (sub.planKey as PlanKey) || null;
}

/**
 * Whether this specific vendor's own active subscription includes the
 * Automatic Telegram Business Report feature (ULTIMATE-tier-only, see
 * plans.ts). Checks the self-serve planKey first; falls back to an admin
 * having hand-picked the "telegram-reports" module directly on
 * console/admin/vendor-billing (that path sets no planKey at all -- see
 * VendorSubscription.planKey's own comment) so both assignment paths work.
 */
export async function vendorHasTelegramReportsPlan(vendorId: string): Promise<boolean> {
  const sub = await VendorSubscription.findOne({ vendorId }).select("planKey currentPeriodEnd modules").lean<any>();
  if (!sub || computeStatus(sub) !== "ACTIVE") return false;
  if (sub.planKey === "ULTIMATE") return true;
  return (sub.modules || []).some((m: any) => m.key === "telegram-reports");
}
