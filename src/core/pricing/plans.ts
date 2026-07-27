/**
 * AN-CRM pricing plans -- placeholder numbers per explicit direction ("for
 * pricing for now you mention accordingly and complete the entire build
 * later we will change"). Three tiers (Basic/Pro/Ultimate) x four billing
 * periods (Monthly/Quarterly/Half-Yearly/Yearly), with a longer period
 * earning a bigger effective discount off the monthly rate -- standard
 * SaaS pattern, encourages annual commitment without being punitive
 * month-to-month. Basic gets a 7-day free trial, per explicit direction.
 *
 * Single source of truth for the /pricing page -- when real pricing is
 * decided, only this file needs to change.
 */

export type PlanKey = "BASIC" | "PRO" | "ULTIMATE";
export type BillingPeriod = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";

export const BILLING_PERIODS: { key: BillingPeriod; label: string; months: number; discountPct: number }[] = [
  { key: "MONTHLY", label: "Monthly", months: 1, discountPct: 0 },
  { key: "QUARTERLY", label: "Quarterly", months: 3, discountPct: 10 },
  { key: "HALF_YEARLY", label: "Half-Yearly", months: 6, discountPct: 15 },
  { key: "YEARLY", label: "Yearly", months: 12, discountPct: 25 },
];

export interface Plan {
  key: PlanKey;
  name: string;
  tagline: string;
  monthlyPriceINR: number;
  freeTrialDays?: number;
  seatLimit: string;
  highlight?: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    key: "BASIC",
    name: "Basic",
    tagline: "For a single Service Center or small POS counter getting started.",
    monthlyPriceINR: 999,
    freeTrialDays: 7,
    seatLimit: "1 login (SC single-screen)",
    features: [
      "SC single-login workorder flow",
      "GST & non-GST billing",
      "BOM / Material list (private)",
      "Basic reports & invoice ZIP export",
      "Email support",
    ],
  },
  {
    key: "PRO",
    name: "Pro",
    tagline: "For a growing Brand team or a multi-till POS operation.",
    monthlyPriceINR: 2999,
    seatLimit: "Up to 10 users",
    highlight: true,
    features: [
      "Everything in Basic",
      "Brand multi-role dashboards (CCO/Manager/Engineer)",
      "Call center + appointment booking",
      "POS with multi-till support",
      "Custom report builder",
      "UPI payment QR on invoices",
      "Priority support",
    ],
  },
  {
    key: "ULTIMATE",
    name: "Ultimate",
    tagline: "For multi-branch Brands and enterprise POS chains.",
    monthlyPriceINR: 6999,
    seatLimit: "Unlimited users",
    features: [
      "Everything in Pro",
      "Sub-vendor hierarchy & management",
      "AI-IVR call routing (add-on)",
      "Multi-currency (when enabled)",
      "Dedicated onboarding + SLA support",
      "API access",
    ],
  },
];

/** Effective monthly-equivalent price for a plan at a given billing period. */
export function priceForPeriod(plan: Plan, period: BillingPeriod): { total: number; perMonth: number; discountPct: number } {
  const p = BILLING_PERIODS.find((b) => b.key === period) || BILLING_PERIODS[0];
  const fullPrice = plan.monthlyPriceINR * p.months;
  const total = Math.round(fullPrice * (1 - p.discountPct / 100));
  const perMonth = Math.round(total / p.months);
  return { total, perMonth, discountPct: p.discountPct };
}
