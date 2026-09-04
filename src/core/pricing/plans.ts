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
// "STARTER" is the new, genuinely-limited bottom tier added per explicit
// direction ("basic plan is required because most normal service centre
// shops not required everything"). "BASIC" stays the PRO-displayed tier's
// internal key (unchanged, avoids a data migration on every existing
// Subscription/VendorSubscription row already using it) -- see this
// file's Plan.name comment on BASIC below.
export type PlanKey = "STARTER" | "BASIC" | "PRO" | "ULTIMATE";
export type BillingPeriod = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "TWO_YEARLY";

export const OPERATING_MODES: { key: OperatingMode; label: string; blurb: string }[] = [
  { key: "SC", label: "Service Center", blurb: "Single-login, single-screen workorder shop." },
];

// Collapsed from 5 billing periods down to 2 -- per explicit direction
// ("remove monthly quarterly and half yearly plans you just show yearly
// and 2 years plans only give good and safe discount in 2 year plans").
// MONTHLY/QUARTERLY/HALF_YEARLY stay valid BillingPeriod values (existing
// VendorBillingInvoice/Subscription records may still reference them) --
// only removed from THIS array, which is what every self-serve UI/route
// actually iterates to offer choices. TWO_YEARLY's discount widened from
// 35% to 40% so the 2-year commitment reads as a meaningfully bigger win
// than yearly, not just 5pp more for double the lock-in.
// Discounts widened again (30/45 -> 35/55) per explicit direction --
// early-stage priority is customer acquisition/getting shops onto the
// platform first, revenue optimization comes after; 2-year still reads as
// a meaningfully bigger commitment discount than yearly (20pp spread,
// same as before).
export const BILLING_PERIODS: { key: BillingPeriod; label: string; months: number; discountPct: number }[] = [
  { key: "YEARLY", label: "Yearly", months: 12, discountPct: 35 },
  { key: "TWO_YEARLY", label: "2 Years", months: 24, discountPct: 55 },
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
// Fixed calendar date per explicit direction ("standard pricing from March
// 1st it should take effect") -- deliberately NOT computed as
// LAUNCH_START + N months anymore, so the cutover reads as a real business
// commitment date rather than an arithmetic side effect that shifts if
// LAUNCH_START is ever edited. Whoever registers and pays before this date
// keeps their purchased rate for their paid term (see currentMonthlyRate's
// own comment) -- only a NEW invoice created on/after this date (a first
// purchase, or a renewal after an earlier paid term expires) prices at
// monthlyPriceINR automatically, no admin action needed.
export const LAUNCH_PRICING_CUTOVER = new Date("2027-03-01T00:00:00+05:30");

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
      key: "STARTER",
      mode: "SC",
      name: "Starter",
      tagline: "For small repair shops just getting started.",
      // Meaningfully below Pro, priced to stay safely profitable on its
      // own (not a loss-leader) -- a real, limited product, not a crippled
      // trial-forever tier. Pro/Ultimate's own numbers are untouched here
      // (already calibrated: Ultimate's rate specifically covers its
      // bundled WhatsApp quota's API cost, per that plan's own comment).
      monthlyPriceINR: 799,
      launchPriceINR: 349,
      freeTrialDays: 15,
      seatLimit: "1 login (single-screen)",
      // Deliberately NOT exhaustive -- this is the "not everything" tier.
      // Missing on purpose vs Pro: Quotations/Credit/Debit/Proforma docs,
      // Delivery Challans, Credit Accounts, Financial Statement, fault/
      // symptom/solution library, Custom Report Builder, Analytics,
      // Telegram alerts, multi-warehouse Stock Transfers.
      features: [
        "Single-login workorder flow, start to close",
        "GST & non-GST invoicing",
        "Private Material/BOM price list",
        "Brands & device models",
        "Customer-facing repair status tracking page",
        "Basic inventory tracking",
        "UPI payment QR on every invoice",
        "15-day free trial, full access, no card required",
        "Email support",
      ],
      moduleKeys: [
        "crm", "crm_jobsheets", "material-catalog", "customers", "sales",
        "admin-settings", "admin-plan", "send-feedback",
      ],
      // No warehouses/stock_transfers (single default location only), no
      // reports/analytics/fault_codes/solutions -- those are Pro+.
      vendorModuleKeys: ["crm", "crm_jobsheets", "materials", "finance", "customers", "settings", "businesses", "inventory"],
    },
    {
      // Internal plan key stays "BASIC" (matches PlanKey/VendorSubscription
      // enum, avoids a data migration) -- but per explicit direction the
      // DISPLAYED name is "Pro", not "Basic": this is now the entry tier
      // of a 2-tier ladder (Pro / Ultimate), not a stripped-down option.
      key: "BASIC",
      mode: "SC",
      name: "Pro",
      tagline: "Everything a service center needs to run day-to-day, at one low price.",
      // Standard (post-launch) price raised 799 -> 1,199 per explicit
      // direction ("make it 1199 & 2499 so we can have better value")
      // -- widens the post-launch Pro/Ultimate gap to 2,499/1,199 = 2.1x,
      // still a real premium spread once launchPriceINR below stops
      // applying at LAUNCH_PRICING_CUTOVER.
      monthlyPriceINR: 1199,
      launchPriceINR: 549,
      freeTrialDays: 15,
      seatLimit: "1 login (single-screen)",
      // Collapsed from a 3-tier ladder (Basic/Pro/Ultimate) to 2 tiers per
      // explicit direction -- the old Pro tier's differentiators (report
      // builder, fault/symptom/solution library, UPI QR) are folded into
      // this tier rather than dropped, so nobody loses anything moving
      // from 3 tiers to 2; only Ultimate's genuinely multi-center/
      // automation features (sub-vendor hierarchy, WhatsApp, auto Telegram
      // reports) stay as the paid-up differentiator. Price raised from the
      // old Basic's ₹499/₹349 to reflect the added value, still well
      // under half of Ultimate.
      // Deliberately exhaustive -- per explicit direction to highlight
      // every single thing included so the price reads as an obvious deal
      // next to the comparison table. Kept in the same order a shop owner
      // would actually use these day to day.
      features: [
        "Single-login workorder flow, start to close",
        "GST & non-GST invoicing",
        "Quotations, Credit Notes, Debit Notes & Proforma Invoices",
        "Private Material/BOM price list",
        "Brands, device models & solution library",
        "Fault code / symptom code library (private)",
        "Customer-facing repair status tracking page",
        "Warehouses, Inventory & Stock Transfers",
        "Delivery Challans",
        "Credit Accounts for repeat customers",
        "Financial Statement — your full running account",
        "Telegram alerts for every new/closed workorder",
        "Custom Report Builder (build your own reports & charts)",
        "Analytics dashboard",
        "UPI payment QR on every invoice",
        "Invoice ZIP export, ready for GST filing",
        "15-day free trial, full access, no card required",
        "Priority support",
      ],
      moduleKeys: [
        "crm", "crm_jobsheets", "material-catalog", "customers", "sales",
        "stock-adjustments", "reports", "admin-settings", "admin-plan", "send-feedback",
        "quotations", "delivery-challans", "credit-notes", "debit-notes", "proforma-invoices",
        "report-builder", "analytics",
      ],
      // Core operational vendor-portal nav (Materials/Warehouses/
      // Workorders/Stock Transfers/Invoices/Statement) plus the former
      // Pro-only fault_codes/solutions library -- see this file's
      // Plan.vendorModuleKeys comment. Deliberately does NOT include
      // "finance-advanced" (Ledger Book/P&L/Expenses) -- those moved to
      // Ultimate-only per explicit direction; Pro keeps plain "finance"
      // (invoicing/documents/statement).
      vendorModuleKeys: ["crm", "crm_jobsheets", "materials", "warehouses", "stock_transfers", "finance", "customers", "settings", "businesses", "reports", "analytics", "fault_codes", "solutions", "inventory"],
    },
    {
      key: "ULTIMATE",
      mode: "SC",
      name: "Ultimate",
      tagline: "Multi-center groups that need scale and value-added services.",
      monthlyPriceINR: 2499,
      // Explicit direction: launch price set to ₹999 (down from ₹1,799)
      // for the first 6 months, after flagging that the bundled WhatsApp
      // quota (1,000 msgs/mo) alone runs ~₹350-900 in API cost -- ₹999
      // still clears that with margin, unlike the ₹799 first floated.
      launchPriceINR: 999,
      seatLimit: "1 login per center, unlimited centers",
      highlight: true,
      // WhatsApp deliberately not listed here -- per explicit direction
      // ("currently don't show whatsapp") -- the quota is still granted
      // on activation (see commsQuota below), just not advertised on
      // public plan surfaces for now.
      features: [
        "Everything in Pro",
        "Ledger Book — party-wise running balance",
        "Profit & Loss reports",
        "Expense tracking",
        "Unlimited sub-vendor / multi-center hierarchy under one login",
        "Automated Telegram business reports (daily/weekly/monthly/yearly, with charts)",
        "Dedicated onboarding",
        "SLA-backed priority support",
      ],
      moduleKeys: [
        "crm", "crm_jobsheets", "material-catalog", "customers", "sales",
        "stock-adjustments", "reports", "admin-settings", "admin-plan", "send-feedback",
        "quotations", "delivery-challans", "credit-notes", "debit-notes", "proforma-invoices",
        "report-builder", "analytics", "sub-accounts", "telegram-reports",
      ],
      // Same operational set as Pro plus "finance-advanced" -- the one
      // real vendor-portal differentiator below the console-side
      // sub-vendor/Telegram set above: Ledger Book/P&L/Expenses moved
      // here from Pro per explicit direction ("those supposed to be in
      // ultimate like ledger book, P&L report, expenses"), since they'd
      // been sharing Pro's "finance" key with plain invoicing (which stays
      // on Pro) -- see vendorAccess.service.ts's VENDOR_MODULE_KEYS.
      vendorModuleKeys: ["crm", "crm_jobsheets", "materials", "warehouses", "stock_transfers", "finance", "finance-advanced", "customers", "settings", "businesses", "reports", "analytics", "fault_codes", "solutions", "inventory"],
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
