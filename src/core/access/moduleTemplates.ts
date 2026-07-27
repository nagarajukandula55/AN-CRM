// Business-type menu templates -- "Apply Template" buttons in the business
// edit page's Modules section (admin/business/[id]/page.tsx). Each template
// is just a starting point for Business.modules[] (bulk pre-check/uncheck);
// the admin can still hand-toggle any individual module afterward and Save
// as usual. No new schema field or API route needed -- this only decides
// which of the existing per-module checkboxes start enabled/disabled.
//
// Categorization is per the module/page audit: which sidebar key only
// makes sense for an e-commerce storefront, which only for a repair/service
// business, and which belongs solely to AN Group platform administration
// (never inside a tenant business's own menu). Everything else defaults to
// enabled for every business category (it's common to any business).

export const ECOMMERCE_ONLY_KEYS = [
  "coupons",
  "products",
  "masters-prod-cat",
  "vendor-settlements",
  "native",
  "logistics",
  "admin-invoice-templates",
];

export const SERVICE_ONLY_KEYS = [
  "masters-models",
  "masters-fault-codes",
  "masters-symptom-codes",
  "masters-solutions",
  "masters-crm-options",
  "crm",
  "crm_calls",
  "crm_jobsheets",
];

// AN Group platform administration -- these never belong in a tenant
// business's own menu, only in the AN Group business's menu.
export const PLATFORM_ONLY_KEYS = [
  "businesses",
  "vendors",
  "admin-users",
  "admin-access",
  "admin-roles",
  "admin-an-group-staff",
  "admin-intg",
  "admin-sso",
  "admin-status",
  "admin-modules",
  "admin-pincode-data",
];

export type ModuleTemplateKey =
  | "ECOMMERCE"
  | "SERVICE"
  | "LOGISTICS"
  | "LAUNDRY"
  | "RESTAURANT"
  | "TRAVELS"
  | "TRANSPORTS"
  | "WHOLESALE"
  | "RETAIL"
  | "SOFTWARE"
  | "PLATFORM"
  | "ALL";

export const MODULE_TEMPLATE_OPTIONS: { value: ModuleTemplateKey; label: string }[] = [
  { value: "ECOMMERCE", label: "E-Commerce business" },
  { value: "SERVICE", label: "Service business" },
  { value: "LOGISTICS", label: "Logistics business" },
  { value: "LAUNDRY", label: "Laundry business" },
  { value: "RESTAURANT", label: "Restaurant business" },
  { value: "TRAVELS", label: "Travels business" },
  { value: "TRANSPORTS", label: "Transports business" },
  { value: "WHOLESALE", label: "Wholesale business" },
  { value: "RETAIL", label: "Retail business" },
  { value: "SOFTWARE", label: "Software business" },
  { value: "PLATFORM", label: "AN Group (platform only)" },
  { value: "ALL", label: "Everything on (no restriction)" },
];

// Every template beyond ECOMMERCE/SERVICE starts from the common-only
// baseline (every module not in one of the three lists above) plus, where
// it's genuinely relevant, a couple of otherwise-"only" keys carved back in.
// No dedicated pages exist yet for Logistics/Laundry/Restaurant/Travels/
// Transports/Software specifically (unlike e-commerce and service, which
// have real built features) -- so those templates deliberately stay
// common-only rather than guessing at modules that don't exist. Extend
// this table when dedicated features get built for a category.
const TEMPLATE_EXTRA_KEYS: Partial<Record<ModuleTemplateKey, string[]>> = {
  // Logistics runs shipping/courier operations -- Logistics & Shipping is
  // directly relevant even though it's otherwise e-commerce-only.
  LOGISTICS: ["logistics"],
  // Wholesale/Retail both sell physical products -- the storefront catalog
  // (Products + Product Categories) is relevant, but NOT the
  // marketplace-specific pieces (coupons, vendor settlements, Native App,
  // shipping/logistics, invoice branding) that only make sense for the
  // actual online marketplace tenant.
  WHOLESALE: ["products", "masters-prod-cat"],
  RETAIL: ["products", "masters-prod-cat"],
};

/**
 * Given every module's sidebar key, return which of them should start
 * enabled for the given template.
 */
export function isEnabledUnderTemplate(key: string, template: ModuleTemplateKey): boolean {
  if (template === "ALL") return true;

  const isPlatform = PLATFORM_ONLY_KEYS.includes(key);
  if (template === "PLATFORM") return isPlatform;
  if (isPlatform) return false; // platform admin pages never show inside a tenant business

  const extra = TEMPLATE_EXTRA_KEYS[template] ?? [];
  if (extra.includes(key)) return true;

  const isEcommerce = ECOMMERCE_ONLY_KEYS.includes(key);
  const isService = SERVICE_ONLY_KEYS.includes(key);

  if (template === "ECOMMERCE") return !isService;
  if (template === "SERVICE") return !isEcommerce;

  // Every other category (Logistics/Laundry/Restaurant/Travels/Transports/
  // Wholesale/Retail/Software): common-only baseline plus whatever this
  // template's TEMPLATE_EXTRA_KEYS carved back in above.
  return !isEcommerce && !isService;
}

const BUSINESS_TYPE_TEMPLATES: ModuleTemplateKey[] = MODULE_TEMPLATE_OPTIONS
  .map((o) => o.value)
  .filter((v) => v !== "ALL" && v !== "PLATFORM");

/**
 * Human-readable summary of which business TYPES actually use a given
 * module -- shown next to each checkbox in the business edit page's
 * Modules section ("On every page also mention which businesses are going
 * to use that data so I can have better clarity while configuring the
 * backend"). Collapses to "All business types" when every non-platform
 * template enables it, rather than spelling out all 9 names.
 */
export function describeBusinessUsage(key: string): string {
  if (PLATFORM_ONLY_KEYS.includes(key)) return "AN Group platform only";

  const using = BUSINESS_TYPE_TEMPLATES.filter((t) => isEnabledUnderTemplate(key, t));
  if (using.length === BUSINESS_TYPE_TEMPLATES.length) return "All business types";
  if (using.length === 0) return "AN Group platform only";

  return using
    .map((t) => MODULE_TEMPLATE_OPTIONS.find((o) => o.value === t)!.label.replace(" business", ""))
    .join(", ");
}
