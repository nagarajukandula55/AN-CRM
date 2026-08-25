import Subscription from "@/models/Subscription";
import VendorProfile from "@/models/VendorProfile";
import VendorSubscription from "@/models/VendorSubscription";

/**
 * True when a vendor must be blocked from the portal. Checks TWO
 * independent trial mechanisms that both exist in this codebase:
 *
 * 1. The older subVendorOf-scoped Subscription row (see
 *    services/vendorActivation.service.ts's activateVendorWithTrial, only
 *    ever created when a Business has marketplace.skipVendorApproval on).
 *    A vendor with no such row always passes this check (nothing to
 *    find), same as before.
 *
 * 2. VendorProfile.trialEndsAt -- the universal 7-day trial EVERY
 *    self-signed-up vendor gets now (see api/vendors/self-signup), no
 *    admin approval or skipVendorApproval toggle involved. Once that
 *    date passes, the vendor is blocked unless they have a real paid
 *    VendorSubscription with a currentPeriodEnd still in the future (see
 *    api/vendor/billing/subscribe + the confirm route that activates it).
 *    A vendor with no trialEndsAt at all (created before this existed, or
 *    activated through the normal admin-approval path with no trial)
 *    is never blocked by this check -- absence means "not trial-gated",
 *    not "trial expired".
 */
export async function isVendorBlockedByExpiredTrial(vendorId: string): Promise<boolean> {
  if (!vendorId) return false;

  const latest = await (Subscription as any)
    .findOne({ subVendorOf: vendorId })
    .sort({ createdAt: -1 })
    .lean();

  if (latest) {
    if (latest.status === "ACTIVE") return false;
    if (latest.status === "EXPIRED") return true;
    if (latest.status === "TRIAL") {
      const trialEndsAt = latest.trialEndsAt ? new Date(latest.trialEndsAt) : null;
      if (trialEndsAt && trialEndsAt.getTime() < Date.now()) return true;
    }
  }

  const vendor = await VendorProfile.findById(vendorId).select("trialEndsAt").lean<any>();
  if (!vendor?.trialEndsAt) return false;
  if (new Date(vendor.trialEndsAt).getTime() > Date.now()) return false;

  const sub = await VendorSubscription.findOne({ vendorId }).select("currentPeriodEnd").lean<any>();
  if (sub?.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > Date.now()) return false;

  return true;
}
