import { crmFetch } from "./client";

export interface SubscriptionStatus {
  status: "TRIAL" | "ACTIVE" | "EXPIRED";
  mode: "BRAND" | "SC" | "POS";
  plan: string;
  billingPeriod: string | null;
  expiryDate: string;
  daysRemaining: number;
  blocked: boolean;
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const data = await crmFetch("/api/subscriptions/status");
  return data;
}
