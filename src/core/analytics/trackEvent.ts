/**
 * Fire-and-forget commercial-funnel event logging -- never throws, never
 * blocks the caller (same spirit as sendVendorAlert/notifyAdmins
 * elsewhere: a logging failure must never break the actual billing action
 * it's describing). See models/AnalyticsEvent.ts for why this exists
 * separately from vendor-facing analytics.
 */
import AnalyticsEvent, { type AnalyticsEventType } from "@/models/AnalyticsEvent";

export function trackEvent(type: AnalyticsEventType, fields: {
  vendorId?: string;
  businessId?: string;
  planKey?: string;
  billingPeriod?: string;
  amount?: number;
  isFoundingPricing?: boolean;
  meta?: Record<string, unknown>;
} = {}): void {
  AnalyticsEvent.create({ type, ...fields }).catch(() => {});
}
