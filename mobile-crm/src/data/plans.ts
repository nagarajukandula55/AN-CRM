/**
 * Mirrors src/core/pricing/plans.ts's PLANS_BY_MODE feature lists on the
 * web app -- kept as a small local copy (not a shared package) since this
 * is a separate Expo project with its own dependency tree. Used only for
 * DISPLAY in the "Services" tab (marketing what's included per tier / what
 * upgrading unlocks); the actual entitlement truth always comes from
 * /api/vendor/billing at runtime, never from this file.
 *
 * SC (Service Center) is the only operating mode the backend supports now
 * -- Brand and POS were removed. Only 2 tiers remain: the internal plan
 * key stays "BASIC" (matches the PlanKey enum, avoids a data migration)
 * but is DISPLAYED as "Pro" -- it's the entry tier of a 2-tier ladder
 * (Pro / Ultimate), not a stripped-down option.
 */
export type PlanKey = "BASIC" | "ULTIMATE";

export interface PlanSummary {
  key: PlanKey;
  name: string;
  monthlyPriceINR: number;
  features: string[];
  hasCommsQuota?: boolean;
}

export const PLANS: PlanSummary[] = [
  {
    key: "BASIC",
    name: "Pro",
    monthlyPriceINR: 1199,
    features: [
      "Single-login workorder flow (CCO + engineer name, free text)",
      "GST & non-GST billing",
      "Private Material/BOM list",
      "Customer workorder tracking page",
      "Custom report builder (saved reports, charts)",
      "UPI payment QR on invoices",
      "Fault code / symptom code / solution library (private)",
      "Invoice ZIP export for GST filing",
      "Priority support",
    ],
  },
  {
    key: "ULTIMATE",
    name: "Ultimate",
    monthlyPriceINR: 2499,
    features: [
      "Everything in Pro",
      "Sub-vendor / multi-center hierarchy",
      "WhatsApp customer notifications (quota below)",
      "Automated Telegram reports (daily/weekly/monthly/yearly, with charts)",
      "Dedicated onboarding + SLA support",
    ],
    hasCommsQuota: true,
  },
];

export const TIER_RANK: Record<PlanKey, number> = { BASIC: 0, ULTIMATE: 1 };
