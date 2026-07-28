/**
 * Shared subscription-blocked check, used by BOTH the session enricher
 * (so requirePermission() enforces it everywhere for free) and
 * /api/subscriptions/status (so the plan page shows the same truth). A
 * business with no paid Subscription row is implicitly on Basic's 7-day
 * free trial, counted from Business.createdAt.
 */
import Subscription from "@/models/Subscription";
import Business from "@/models/Business";
import { PLANS } from "@/core/pricing/plans";

const TRIAL_DAYS = PLANS.find((p) => p.key === "BASIC")?.freeTrialDays || 7;

export async function isSubscriptionBlocked(businessId: string): Promise<boolean> {
  const latest = await Subscription.findOne({
    businessId,
    subVendorOf: null,
    status: { $in: ["ACTIVE", "EXPIRED"] },
  })
    .sort({ createdAt: -1 })
    .select("status expiryDate")
    .lean<any>();

  if (latest) {
    return latest.status === "EXPIRED" || new Date(latest.expiryDate).getTime() < Date.now();
  }

  const business = await Business.findById(businessId).select("createdAt").lean<any>();
  if (!business?.createdAt) return false; // never block on missing data
  const trialEndsAt = new Date(business.createdAt);
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
  return trialEndsAt.getTime() < Date.now();
}
