/**
 * Shared subscription-blocked check, used by BOTH the session enricher
 * (so requirePermission() enforces it everywhere for free) and
 * /api/subscriptions/status (so the plan page shows the same truth). A
 * business with no paid Subscription row is implicitly on Basic's 30-day
 * free trial, counted from Business.createdAt.
 */
import Subscription from "@/models/Subscription";
import Business from "@/models/Business";
import VendorProfile from "@/models/VendorProfile";

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

  // A shared multi-vendor Business (the default platform Business every
  // self-signed-up vendor lands on, or any business with real
  // VendorProfile sub-accounts) is NOT itself the paying entity -- each
  // VENDOR is, gated independently by its own trial/subscription (see
  // lib/vendor/checkTrialAccess.ts, VendorProfile.trialEndsAt,
  // VendorSubscription.currentPeriodEnd). This generic 30-day-from-
  // creation fallback below was designed for a genuine single-tenant
  // business customer with no vendor layer at all -- applying it to a
  // shared business instead means the SHARED business's own age (its
  // very first creation, potentially months before any of the vendors on
  // it even existed) silently blocks every vendor sharing it the moment
  // that fixed window passes, regardless of each vendor's own actual
  // trial/subscription status. Reported live: the shared "My Biz Flow"
  // business hit this 30-day cliff and every vendor on the platform got
  // "Subscription expired" on every permission-gated route, even vendors
  // whose own trial had days left or who'd already paid.
  const hasVendors = await VendorProfile.exists({ businessId, isDeleted: { $ne: true } });
  if (hasVendors) return false;

  const business = await Business.findById(businessId).select("createdAt").lean<any>();
  if (!business?.createdAt) return false; // never block on missing data
  const trialEndsAt = new Date(business.createdAt);
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
  return trialEndsAt.getTime() < Date.now();
}
