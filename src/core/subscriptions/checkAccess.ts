/**
 * Shared subscription-blocked check, used by BOTH the session enricher
 * (so requirePermission() enforces it everywhere for free) and
 * /api/subscriptions/status (so the plan page shows the same truth). A
 * business with no paid Subscription row is implicitly on Basic's 7-day
 * free trial, counted from Business.createdAt.
 */
import Subscription from "@/models/Subscription";
import Business from "@/models/Business";

// Deliberately left at 30 (more generous than the 15-day trial elsewhere
// in core/pricing/plans.ts) rather than tightened to match -- lowering
// this would immediately flip any business between day 15 and day 30 of
// its trial from "fine" to "blocked" the moment this deployed, which is
// the opposite of what's wanted here. A fixed constant since this check
// runs before a business necessarily has an operatingMode set.
const TRIAL_DAYS = 30;

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
