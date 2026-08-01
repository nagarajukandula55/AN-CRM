/**
 * AN-CRM pricing plans -- per-operating-mode (Brand/SC/POS each get their
 * own Basic/Pro/Ultimate ladder, per explicit direction: "for SC - Basic,
 * Pro & Ultimate and then for Brand ... and for POS ... because for those
 * businesses what we are providing is matters"). Placeholder numbers
 * ("for pricing for now you mention accordingly ... later we will
 * change"), but the FEATURE SETS per tier are real and differ by mode
 * because the underlying product differs by mode (SC = single-screen
 * workorder shop, Brand = multi-role call-center + appointments, POS =
 * billing counter). Communication quota (Email/WhatsApp push, see
 * models/CommunicationQuota.ts) is bundled specifically into each mode's
 * ULTIMATE tier, per explicit direction ("value added services like
 * Emails, Whatsapp messages push ... we can use in ultimate packs").
 *
 * Single source of truth for /pricing and /console/plan -- when real pricing
 * is decided, only this file needs to change.
 */

export type OperatingMode = "BRAND" | "SC" | "POS";
export type PlanKey = "BASIC" | "PRO" | "ULTIMATE";
export type BillingPeriod = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";

export const OPERATING_MODES: { key: OperatingMode; label: string; blurb: string }[] = [
  { key: "SC", label: "Service Center", blurb: "Single-login, single-screen workorder shop." },
  { key: "BRAND", label: "Brand", blurb: "Multi-role call center, appointments, service network." },
  { key: "POS", label: "POS", blurb: "Transactional billing counter — small store to enterprise." },
];

export const BILLING_PERIODS: { key: BillingPeriod; label: string; months: number; discountPct: number }[] = [
  { key: "MONTHLY", label: "Monthly", months: 1, discountPct: 0 },
  { key: "QUARTERLY", label: "Quarterly", months: 3, discountPct: 10 },
  { key: "HALF_YEARLY", label: "Half-Yearly", months: 6, discountPct: 15 },
  { key: "YEARLY", label: "Yearly", months: 12, discountPct: 25 },
];

export interface Plan {
  key: PlanKey;
  mode: OperatingMode;
  name: string;
  tagline: string;
  monthlyPriceINR: number;
  freeTrialDays?: number;
  seatLimit: string;
  highlight?: boolean;
  features: string[];
  /** Communication quota bundled at this tier — shown as a callout, feeds CommunicationQuota allocation on activation. */
  commsQuota?: { emailPerMonth: number; whatsappPerMonth: number };
  /**
   * Which sidebar module keys (matches sidebar-nav.ts STATIC_MODULES keys)
   * this tier unlocks, plus a handful of synthetic feature keys that gate
   * something other than a nav item (e.g. "telegram-reports" — the
   * automatic daily/weekly/monthly Telegram business report). Enforced in
   * api/ui/sidebar/route.ts on top of the existing permission system, not
   * instead of it -- a business must both hold the permission AND have it
   * included in their plan. Editable at runtime by Super Admin via
   * /console/admin/plan-features (PlanFeatureConfig overrides this
   * static default when a DB row exists for mode+plan) -- see
   * core/pricing/planAccess.ts.
   */
  moduleKeys: string[];
}

export const PLANS_BY_MODE: Record<OperatingMode, Plan[]> = {
  SC: [
    {
      key: "BASIC",
      mode: "SC",
      name: "Basic",
      tagline: "One service center getting started with digital workorders.",
      monthlyPriceINR: 799,
      freeTrialDays: 7,
      seatLimit: "1 login (single-screen)",
      features: [
        "Single-login workorder flow (CCO + engineer name, free text)",
        "GST & non-GST billing",
        "Private Material/BOM list",
        "Customer workorder tracking page",
        "Basic reports + invoice ZIP export for GST filing",
        "Email support",
      ],
      // report-builder/analytics/reports are all already-existing
      // features every business has always had -- kept on Basic too so
      // plan-gating (introduced after these were already in general use)
      // never retroactively takes something away. Only genuinely NEW
      // features (sub-accounts, telegram-reports) are actual tier
      // differentiators for now.
      moduleKeys: [
        "crm", "crm_jobsheets", "material-catalog", "customers", "sales",
        "stock-adjustments", "reports", "report-builder", "analytics",
        "admin-settings", "admin-plan", "send-feedback",
        "quotations", "delivery-challans", "credit-notes", "debit-notes", "proforma-invoices",
      ],
    },
    {
      key: "PRO",
      mode: "SC",
      name: "Pro",
      tagline: "A busier center that needs deeper reporting and faster billing.",
      monthlyPriceINR: 1999,
      seatLimit: "1 login (single-screen)",
      highlight: true,
      features: [
        "Everything in Basic",
        "Custom report builder (saved reports, charts)",
        "UPI payment QR on invoices",
        "Fault code / symptom code / solution library (private)",
        "Priority support",
      ],
      moduleKeys: [
        "crm", "crm_jobsheets", "material-catalog", "customers", "sales",
        "stock-adjustments", "reports", "admin-settings", "admin-plan", "send-feedback",
        "quotations", "delivery-challans", "credit-notes", "debit-notes", "proforma-invoices",
        "report-builder", "analytics",
      ],
    },
    {
      key: "ULTIMATE",
      mode: "SC",
      name: "Ultimate",
      tagline: "Multi-center groups that need scale and value-added services.",
      monthlyPriceINR: 3999,
      seatLimit: "1 login per center, unlimited centers",
      features: [
        "Everything in Pro",
        "Sub-vendor / multi-center hierarchy",
        "Email + WhatsApp customer notifications (quota below)",
        "Scheduled report delivery by email",
        "Dedicated onboarding + SLA support",
      ],
      moduleKeys: [
        "crm", "crm_jobsheets", "material-catalog", "customers", "sales",
        "stock-adjustments", "reports", "admin-settings", "admin-plan", "send-feedback",
        "quotations", "delivery-challans", "credit-notes", "debit-notes", "proforma-invoices",
        "report-builder", "analytics", "sub-accounts", "telegram-reports",
      ],
      commsQuota: { emailPerMonth: 2000, whatsappPerMonth: 1000 },
    },
  ],
  BRAND: [
    {
      key: "BASIC",
      mode: "BRAND",
      name: "Basic",
      tagline: "A small Brand team starting with call intake and job sheets.",
      monthlyPriceINR: 1499,
      freeTrialDays: 7,
      seatLimit: "Up to 5 users",
      features: [
        "CCO/Manager/Engineer role dashboards",
        "Call intake → job sheet → closure flow",
        "GST & non-GST billing",
        "Shared Material/BOM catalog (linked to Brand fault/symptom/solution library)",
        "Basic reports + invoice ZIP export for GST filing",
        "Email support",
      ],
      // See SC Basic's identical comment -- report-builder/analytics kept
      // here too so plan-gating never retroactively removes an
      // already-in-use feature.
      moduleKeys: [
        "crm", "crm_calls", "crm_jobsheets", "material-catalog", "customers", "sales",
        "reports", "report-builder", "analytics", "deals",
        "admin-settings", "admin-plan", "admin-intg", "send-feedback",
        "quotations", "delivery-challans", "credit-notes", "debit-notes", "proforma-invoices",
      ],
    },
    {
      key: "PRO",
      mode: "BRAND",
      name: "Pro",
      tagline: "A growing Brand network with appointments and multiple centers.",
      monthlyPriceINR: 4999,
      seatLimit: "Up to 25 users",
      highlight: true,
      features: [
        "Everything in Basic",
        "Call center + appointment booking",
        "Brands/Modes/Series/Variants synced from ANgroup catalog",
        "Custom report builder (saved reports, charts)",
        "UPI payment QR on invoices",
        "Priority support",
      ],
      moduleKeys: [
        "crm", "crm_calls", "crm_jobsheets", "material-catalog", "customers", "sales",
        "reports", "admin-settings", "admin-plan", "admin-intg", "send-feedback",
        "quotations", "delivery-challans", "credit-notes", "debit-notes", "proforma-invoices",
        "deals", "report-builder", "analytics",
      ],
    },
    {
      key: "ULTIMATE",
      mode: "BRAND",
      name: "Ultimate",
      tagline: "Multi-branch Brand operations with sub-vendors and automation.",
      monthlyPriceINR: 11999,
      seatLimit: "Unlimited users",
      features: [
        "Everything in Pro",
        "Sub-vendor hierarchy & management",
        "Email + WhatsApp customer notifications (quota below)",
        "Scheduled report delivery by email",
        "Multi-currency (when enabled)",
        "AI-IVR call routing (add-on)",
        "Dedicated onboarding + SLA support, API access",
      ],
      moduleKeys: [
        "crm", "crm_calls", "crm_jobsheets", "material-catalog", "customers", "sales",
        "reports", "admin-settings", "admin-plan", "admin-intg", "send-feedback",
        "quotations", "delivery-challans", "credit-notes", "debit-notes", "proforma-invoices",
        "deals", "report-builder", "analytics", "sub-accounts", "telegram-reports", "admin-modules",
      ],
      commsQuota: { emailPerMonth: 10000, whatsappPerMonth: 5000 },
    },
  ],
  POS: [
    {
      key: "BASIC",
      mode: "POS",
      name: "Basic",
      tagline: "A single counter that needs fast GST billing.",
      monthlyPriceINR: 699,
      freeTrialDays: 7,
      seatLimit: "1 till",
      features: [
        "Quick-sale POS billing screen",
        "GST & non-GST invoicing, B2B/B2C split",
        "UPI payment QR on invoices",
        "Basic reports + invoice ZIP export for GST filing",
        "Email support",
      ],
      moduleKeys: ["sales", "customers", "material-catalog", "reports", "report-builder", "analytics", "admin-settings", "admin-plan", "send-feedback"],
    },
    {
      key: "PRO",
      mode: "POS",
      name: "Pro",
      tagline: "A store with more than one till or a sales team to track.",
      monthlyPriceINR: 1999,
      seatLimit: "Up to 10 tills",
      highlight: true,
      features: [
        "Everything in Basic",
        "Multi-till support with named Sales Executives",
        "Custom report builder (saved reports, charts)",
        "Shared Material catalog",
        "Priority support",
      ],
      moduleKeys: ["sales", "customers", "material-catalog", "reports", "admin-settings", "admin-plan", "send-feedback", "report-builder", "analytics"],
    },
    {
      key: "ULTIMATE",
      mode: "POS",
      name: "Ultimate",
      tagline: "Enterprise retail chains billing at scale.",
      monthlyPriceINR: 6999,
      seatLimit: "Unlimited tills",
      features: [
        "Everything in Pro",
        "Sub-vendor / multi-store hierarchy",
        "Email + WhatsApp receipt & offer notifications (quota below)",
        "Scheduled report delivery by email",
        "Dedicated onboarding + SLA support, API access",
      ],
      moduleKeys: ["sales", "customers", "material-catalog", "reports", "admin-settings", "admin-plan", "send-feedback", "report-builder", "analytics", "sub-accounts", "telegram-reports"],
      commsQuota: { emailPerMonth: 5000, whatsappPerMonth: 2500 },
    },
  ],
};

/** Flat list of every plan across every mode — used where the specific mode isn't known yet (e.g. an existing Subscription record predating mode-specific plans). */
export const ALL_PLANS: Plan[] = [...PLANS_BY_MODE.SC, ...PLANS_BY_MODE.BRAND, ...PLANS_BY_MODE.POS];

export function findPlan(mode: OperatingMode, key: PlanKey): Plan | undefined {
  return PLANS_BY_MODE[mode]?.find((p) => p.key === key);
}

/** Effective monthly-equivalent price for a plan at a given billing period. */
export function priceForPeriod(plan: Plan, period: BillingPeriod): { total: number; perMonth: number; discountPct: number } {
  const p = BILLING_PERIODS.find((b) => b.key === period) || BILLING_PERIODS[0];
  const fullPrice = plan.monthlyPriceINR * p.months;
  const total = Math.round(fullPrice * (1 - p.discountPct / 100));
  const perMonth = Math.round(total / p.months);
  return { total, perMonth, discountPct: p.discountPct };
}
