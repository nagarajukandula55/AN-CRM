import Subscription from "@/models/Subscription";

/**
 * True when a vendor's most recent trial/paid Subscription (the
 * subVendorOf-scoped row created by
 * services/vendorActivation.service.ts's activateVendorWithTrial, see
 * Business.ts's marketplace.skipVendorApproval) has run out and nothing
 * else covers them -- i.e. they must be blocked from the vendor portal
 * until they pick a paid plan. A vendor onboarded through the normal
 * admin-approval flow never gets a Subscription row with subVendorOf set
 * at all, so this always returns false for them (no rows to find).
 */
export async function isVendorBlockedByExpiredTrial(vendorId: string): Promise<boolean> {
  if (!vendorId) return false;

  const latest = await (Subscription as any)
    .findOne({ subVendorOf: vendorId })
    .sort({ createdAt: -1 })
    .lean();

  if (!latest) return false;

  if (latest.status === "ACTIVE") return false;

  if (latest.status === "EXPIRED") return true;

  if (latest.status === "TRIAL") {
    const trialEndsAt = latest.trialEndsAt ? new Date(latest.trialEndsAt) : null;
    if (trialEndsAt && trialEndsAt.getTime() < Date.now()) return true;
  }

  return false;
}
