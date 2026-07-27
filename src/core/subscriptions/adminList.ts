import Subscription from "@/models/Subscription";

/** Shared query used by both the session-gated and service-token-gated admin subscription list routes. */
export async function listSubscriptionsForAdmin() {
  return Subscription.find({ subVendorOf: null })
    .sort({ createdAt: -1 })
    .limit(500)
    .populate("businessId", "name businessCode operatingMode")
    .lean();
}
