import { crmFetch } from "./client";

/**
 * Backed by /api/vendor/billing (VendorSubscription + VendorBillingInvoice),
 * NOT the old /api/subscriptions/status -- that endpoint and the whole
 * Brand/POS/mode concept it drove are gone from the backend. SC (Service
 * Center) is the only mode now, so there's no "mode" field to branch on
 * anywhere in this app anymore.
 */
export type BillingStatus = "NOT_SET" | "UNPAID" | "ACTIVE" | "EXPIRED";

export interface VendorSubscriptionSummary {
  planKey?: "BASIC" | "ULTIMATE";
  planName?: string;
  currentPeriodEnd?: string | null;
  modules?: string[];
}

export interface VendorBillingInvoiceSummary {
  _id: string;
  invoiceNumber?: string;
  amount?: number;
  status?: string;
  createdAt: string;
}

export interface BillingInfo {
  subscription: VendorSubscriptionSummary | null;
  status: BillingStatus;
  invoices: VendorBillingInvoiceSummary[];
}

export async function getBillingInfo(): Promise<BillingInfo> {
  const data = await crmFetch("/api/vendor/billing");
  return {
    subscription: data.subscription || null,
    status: data.status,
    invoices: data.invoices || [],
  };
}

/** Days remaining until currentPeriodEnd, or null when there's no period end on file (NOT_SET/UNPAID). */
export function daysRemaining(sub: VendorSubscriptionSummary | null): number | null {
  if (!sub?.currentPeriodEnd) return null;
  const ms = new Date(sub.currentPeriodEnd).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
