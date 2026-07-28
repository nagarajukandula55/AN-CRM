/**
 * Mirrors src/core/pricing/plans.ts's PLANS_BY_MODE feature lists on the
 * web app -- kept as a small local copy (not a shared package) since this
 * is a separate Expo project with its own dependency tree. Used only for
 * DISPLAY in the "Services" tab (marketing what's included per tier / what
 * upgrading unlocks); the actual entitlement truth always comes from
 * /api/subscriptions/status at runtime, never from this file.
 */
export type OperatingMode = "BRAND" | "SC" | "POS";
export type PlanKey = "BASIC" | "PRO" | "ULTIMATE";

export interface PlanSummary {
  key: PlanKey;
  name: string;
  monthlyPriceINR: number;
  features: string[];
  hasCommsQuota?: boolean;
}

export const PLANS_BY_MODE: Record<OperatingMode, PlanSummary[]> = {
  SC: [
    { key: "BASIC", name: "Basic", monthlyPriceINR: 799, features: ["Single-login workorder flow", "GST & non-GST billing", "Private Material/BOM list", "Invoice ZIP export for GST filing"] },
    { key: "PRO", name: "Pro", monthlyPriceINR: 1999, features: ["Everything in Basic", "Custom report builder", "UPI payment QR on invoices", "Fault/symptom/solution library"] },
    { key: "ULTIMATE", name: "Ultimate", monthlyPriceINR: 3999, features: ["Everything in Pro", "Sub-vendor / multi-center hierarchy", "Email + WhatsApp notifications", "Scheduled report delivery"], hasCommsQuota: true },
  ],
  BRAND: [
    { key: "BASIC", name: "Basic", monthlyPriceINR: 1499, features: ["CCO/Manager/Engineer dashboards", "Call intake → job sheet → closure", "GST & non-GST billing", "Shared Material/BOM catalog"] },
    { key: "PRO", name: "Pro", monthlyPriceINR: 4999, features: ["Everything in Basic", "Call center + appointment booking", "Brands/Modes/Series synced from ANgroup", "Custom report builder"] },
    { key: "ULTIMATE", name: "Ultimate", monthlyPriceINR: 11999, features: ["Everything in Pro", "Sub-vendor hierarchy & management", "Email + WhatsApp notifications", "Multi-currency, AI-IVR routing, API access"], hasCommsQuota: true },
  ],
  POS: [
    { key: "BASIC", name: "Basic", monthlyPriceINR: 699, features: ["Quick-sale POS billing", "GST & non-GST invoicing", "UPI payment QR", "Invoice ZIP export for GST filing"] },
    { key: "PRO", name: "Pro", monthlyPriceINR: 1999, features: ["Everything in Basic", "Multi-till support", "Custom report builder", "Shared Material catalog"] },
    { key: "ULTIMATE", name: "Ultimate", monthlyPriceINR: 6999, features: ["Everything in Pro", "Sub-vendor / multi-store hierarchy", "Email + WhatsApp notifications", "Scheduled report delivery"], hasCommsQuota: true },
  ],
};

export const TIER_RANK: Record<PlanKey, number> = { BASIC: 0, PRO: 1, ULTIMATE: 2 };
