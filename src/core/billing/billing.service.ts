import { IVendorSubscription } from "@/models/VendorSubscription";

export type SubscriptionStatus = "NOT_SET" | "UNPAID" | "ACTIVE" | "EXPIRED";

export function computeStatus(sub: Pick<IVendorSubscription, "modules" | "currentPeriodEnd"> | null): SubscriptionStatus {
  if (!sub || !sub.modules?.length) return "NOT_SET";
  if (!sub.currentPeriodEnd) return "UNPAID";
  return new Date(sub.currentPeriodEnd).getTime() > Date.now() ? "ACTIVE" : "EXPIRED";
}

export function totalAmount(modules: { rate: number }[]): number {
  return modules.reduce((sum, m) => sum + (Number(m.rate) || 0), 0);
}

/**
 * Extends a subscription's paid-through date by validityDays. If the
 * current period already runs into the future (an early renewal), extends
 * from the existing end date rather than from today, so paying early never
 * shortens a vendor's access.
 */
export function extendPeriod(currentPeriodEnd: Date | null, validityDays: number): { start: Date; end: Date } {
  const now = new Date();
  const base = currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime() ? currentPeriodEnd : now;
  const end = new Date(base.getTime() + validityDays * 24 * 60 * 60 * 1000);
  return { start: now, end };
}
