/**
 * AN-CRM pricing plans -- SC (Service Center) is the only operating mode
 * this app supports; BRAND and POS were removed after confirming live
 * (zero Business or VendorProfile documents in production ever used
 * either) -- see git history for the original per-mode ladders if a
 * second vertical is ever added back.
 *
 * Single source of truth for /pricing and /console/plan -- when real
 * pricing changes, only this file needs to change.
 */

export type OperatingMode = "SC";
export type PlanKey = "BASIC" | "PRO" | "ULTIMATE";
export type BillingPeriod = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "TWO_YEARLY";

export const OPERATING_MODES: { key: OperatingMode; label: string; blurb: string }[] = [
  { key: "SC", label: "Service Center", blurb: "Single-login, single-screen workorder shop." },
];

export const BILLING_PERIODS: { key: BillingPeriod; label: string; months: number; discountPct: number }[] = [
  { key: "MONTHLY", label: "Monthly", months: 1, discountPct: 0 },
  { key: "QUARTERLY", label: "Quarterly", months: 3, discountPct: 10 },
  { key: "HALF_YEARLY", label: "Half-Yearly", months: 6, discountPct: 20 },
  { key: "YEARLY", label: "Yearly", months: 12, discountPct: 30 },
  { key: "TWO_YEARLY", label: "2 Years", months: 24, discountPct: 35 },
];

/**
 * Launch-pricing auto-hike: bare-minimum introductory price for the first
 * LAUNCH_WINDOW_MONTHS from LAUNCH_START, then automatically -- no admin
 * action needed -- every NEW invoice (first purchase or renewal) prices at
 * each plan's standard `monthlyPriceINR` instead. Per explicit direction
 * ("set to pending activities... set the bare minimum pricing for now...
 * after that time we will increase to the max... fix backend now itself
 * so it will go on automode only").
 *
 * Deliberately NOT per-vendor-grandfathered -- an early adopter's price
 * rises at the same cutover as everyone else's, same as a plain global
 * price change. Grandfathering (locking each vendor's own signup-time
 * price for a period after the cutover) is real follow-up work if wanted
 * later: it needs a rate snapshot stored on VendorSubscription itself,
 * not just this static cutover, since "isDue" then has to be evaluated
 * per-vendor instead of globally.
 */
export const LAUNCH_START = new Date("2026-08-25T00:00:00+05:30");
export const LAUNCH_WINDOW_MONTHS = 6;
export const LAUNCH_PRICING_CUTOVER = new Date(LAUNCH_START);
LAUNCH_PRICING_CUTOVER.setMonth(LAUNCH_PRICING_CUTOVER.getMonth() + LAUNCH_WINDOW_MONTHS);

export function isLaunchPricingActive(now: Date = new Date()): boolean {
  return now.getTime() < LAUNCH_PRICING_CUTOVER.getTime();
}

export interface Plan {
  key: PlanKey;
  mode: OperatingMode;
  name: string;
  tagline: string;
  monthlyPriceINR: number;
  /** Bare-minimum introductory price, active until LAUNCH_PRICING_CUTOVER (see that const's comment) -- after which monthlyPriceINR applies automatically, no admin action needed. */
  launchPriceINR: number;
  freeTrialDays?: number;
  seatLimit: string;
  highlight?: boolean;
  features: string[];
  /** WhatsApp-only customer-notification quota bundled at this tier -- shown as a callout, feeds CommunicationQuota allocation on activation. Email notifications are explicitly out of scope for now, per direction. */
  commsQuota?: { whatsappPerMonth: number };
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
  /**
   * DIFFERENT vocabulary from moduleKeys above -- these are real
   * VENDOR_MODULE_KEYS entries (core/access/vendorAccess.service.ts),
   * the permission-module keys that actually gate the VENDOR PORTAL's own
   * nav (src/app/vendor/layout.tsx's navItems, via
   * getVendorAvailableModules() intersecting against
   * VendorSubscription.modules). moduleKeys above gates the CONSOLE
   * sidebar + a few synthetic feature flags (api/ui/sidebar/route.ts) --
   * a vendor's own portal never reads that list at all. Used by
   * api/vendor/billing/subscribe/route.ts to populate
   * VendorSubscription.modules on self-serve purchase; using moduleKeys
   * there instead (as this file's own history did) meant a self-serve
   * vendor's portal nav collapsed to almost nothing on subscribing --
   * `paidFor.has(m.key)` never matched since the two vocabularies barely
   * overlap. See that route's own comment.
   */
  vendorModuleKeys: string[];
}

export const PLANS_BY_MODE: Record<OperatingMode, Plan[]> = {
  SC: [
    {
      key: "BASIC",
      mode: "SC",
      name: "Basic",
      tagline: "One service center getting started with digital workorders.",
      monthlyPriceINR: 499,
      launchPriceINR: 349,
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
      // analytics/reports are already-existing features every business has
      // always had -- kept on Basic too so plan-gating (introduced after
      // these were already in general use) never retroactively takes
      // something away. Report Builder, however, is a genuine Pro+
      // differentiator (per explicit direction) since its main value --
      // slicing by fault/symptom code -- needs the Pro+ fault/symptom
      // library to be worth anything anyway.
      moduleKeys: [
        "crm", "crm_jobsheets", "material-catalog", "customers", "sales",
        "stock-adjustments", "reports", "analytics",
        "admin-settings", "admin-plan", "send-feedback",
        "quotations", "delivery-challans", "credit-notes", "debit-notes", "proforma-invoices",
      ],
      // Core operational vendor-portal nav (Materials/Warehouses/
      // Workorders/Stock Transfers/Invoices/Statement) -- see this file's
      // Plan.vendorModuleKeys comment. Never a tier differentiator; every
      // tier gets full operational access, same as moduleKeys above kept
      // already-in-use features on Basic.
      vendorModuleKeys: ["crm", "crm_jobsheets", "materials", "warehouses", "stock_transfers", "finance", "customers", "settings", "businesses", "reports", "analytics"],
    },
    {
      key: "PRO",
      mode: "SC",
      name: "Pro",
      tagline: "A busier center that needs deeper reporting and faster billing.",
      monthlyPriceINR: 1299,
      launchPriceINR: 899,
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
      // Adds fault_codes/solutions on top of Basic's operational set --
      // the vendor-portal-visible half of Pro's "fault/symptom/solution
      // library" feature (the console-side half is gated by moduleKeys'
      // "report-builder" above, since the library is only useful paired
      // with the report builder that can slice by it).
      vendorModuleKeys: ["crm", "crm_jobsheets", "materials", "warehouses", "stock_transfers", "finance", "customers", "settings", "businesses", "reports", "analytics", "fault_codes", "solutions"],
    },
    {
      key: "ULTIMATE",
      mode: "SC",
      name: "Ultimate",
      tagline: "Multi-center groups that need scale and value-added services.",
      monthlyPriceINR: 2499,
      launchPriceINR: 1799,
      seatLimit: "1 login per center, unlimited centers",
      features: [
        "Everything in Pro",
        "Sub-vendor / multi-center hierarchy",
        "WhatsApp customer notifications (quota below)",
        "Automated Telegram reports (daily/weekly/monthly/yearly, with charts)",
        "Dedicated onboarding + SLA support",
      ],
      moduleKeys: [
        "crm", "crm_jobsheets", "material-catalog", "customers", "sales",
        "stock-adjustments", "reports", "admin-settings", "admin-plan", "send-feedback",
        "quotations", "delivery-challans", "credit-notes", "debit-notes", "proforma-invoices",
        "report-builder", "analytics", "sub-accounts", "telegram-reports",
      ],
      // Same operational set as Pro -- Ultimate's real differentiators
      // (sub-vendor hierarchy, Telegram automated reports) live on the
      // CONSOLE side (moduleKeys' "sub-accounts"/"telegram-reports"
      // above), not as vendor-portal nav items, so there's nothing more
      // to unlock here.
      vendorModuleKeys: ["crm", "crm_jobsheets", "materials", "warehouses", "stock_transfers", "finance", "customers", "settings", "businesses", "reports", "analytics", "fault_codes", "solutions"],
      commsQuota: { whatsappPerMonth: 1000 },
    },
  ],
};

/** Flat list of every plan -- kept as its own export since a few callers predate SC being the only mode and still iterate "every plan" generically. */
export const ALL_PLANS: Plan[] = [...PLANS_BY_MODE.SC];

export function findPlan(mode: OperatingMode, key: PlanKey): Plan | undefined {
  return PLANS_BY_MODE[mode]?.find((p) => p.key === key);
}

/** The per-month rate to actually charge right now -- launchPriceINR before LAUNCH_PRICING_CUTOVER, monthlyPriceINR automatically after, no admin action needed. */
export function currentMonthlyRate(plan: Plan, now: Date = new Date()): number {
  return isLaunchPricingActive(now) ? plan.launchPriceINR : plan.monthlyPriceINR;
}

/** Effective total/per-month price for a plan at a given billing period, using whichever base rate (launch or standard) is currently active. */
export function priceForPeriod(plan: Plan, period: BillingPeriod, now: Date = new Date()): { total: number; perMonth: number; discountPct: number } {
  const p = BILLING_PERIODS.find((b) => b.key === period) || BILLING_PERIODS[0];
  const baseRate = currentMonthlyRate(plan, now);
  const fullPrice = baseRate * p.months;
  const total = Math.round(fullPrice * (1 - p.discountPct / 100));
  const perMonth = Math.round(total / p.months);
  return { total, perMonth, discountPct: p.discountPct };
}
