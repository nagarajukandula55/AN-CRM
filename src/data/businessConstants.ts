/**
 * Shared enums for Business Type and Industry, used by every business
 * create/edit form so the choices are consistent and validated instead of
 * free-text. Kept as plain string-literal arrays (not a TS `enum`) so they
 * can be imported directly into both server-side Mongoose schema `enum`
 * arrays and client-side <select> options without extra mapping.
 */

export const BUSINESS_TYPES = [
  "PROPRIETORSHIP",
  "PARTNERSHIP",
  "LLP",
  "PRIVATE_LIMITED",
  "PUBLIC_LIMITED",
  "ONE_PERSON_COMPANY",
  "HUF",
  "TRUST",
  "SOCIETY",
  "GOVERNMENT",
  "COOPERATIVE",
  "NGO",
  "FRANCHISE",
  "BRANCH_OFFICE",
  "OTHER",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  PROPRIETORSHIP: "Proprietorship",
  PARTNERSHIP: "Partnership",
  LLP: "Limited Liability Partnership (LLP)",
  PRIVATE_LIMITED: "Private Limited Company",
  PUBLIC_LIMITED: "Public Limited Company",
  ONE_PERSON_COMPANY: "One Person Company (OPC)",
  HUF: "Hindu Undivided Family (HUF)",
  TRUST: "Trust",
  SOCIETY: "Society",
  GOVERNMENT: "Government Entity",
  COOPERATIVE: "Cooperative Society",
  NGO: "NGO / Non-Profit",
  FRANCHISE: "Franchise",
  BRANCH_OFFICE: "Branch Office",
  OTHER: "Other",
};

export const INDUSTRIES = [
  "AGRICULTURE",
  "AUTOMOTIVE",
  "BANKING_FINANCE",
  "CONSTRUCTION_REAL_ESTATE",
  "CONSUMER_ELECTRONICS",
  "EDUCATION",
  "ENERGY_UTILITIES",
  "FMCG",
  "FOOD_BEVERAGE",
  "HEALTHCARE_PHARMA",
  "HOSPITALITY_TRAVEL",
  "IT_SOFTWARE",
  "LOGISTICS_TRANSPORT",
  "MANUFACTURING",
  "MEDIA_ENTERTAINMENT",
  "RETAIL_ECOMMERCE",
  "TELECOM",
  "TEXTILES_APPAREL",
  "CHEMICALS",
  "METALS_MINING",
  "AGRICULTURE_INPUTS",
  "JEWELLERY",
  "FURNITURE",
  "PACKAGING",
  "OTHER",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRY_LABELS: Record<Industry, string> = {
  AGRICULTURE: "Agriculture & Farming",
  AUTOMOTIVE: "Automotive",
  BANKING_FINANCE: "Banking & Finance",
  CONSTRUCTION_REAL_ESTATE: "Construction & Real Estate",
  CONSUMER_ELECTRONICS: "Consumer Electronics",
  EDUCATION: "Education",
  ENERGY_UTILITIES: "Energy & Utilities",
  FMCG: "FMCG",
  FOOD_BEVERAGE: "Food & Beverage",
  HEALTHCARE_PHARMA: "Healthcare & Pharma",
  HOSPITALITY_TRAVEL: "Hospitality & Travel",
  IT_SOFTWARE: "IT & Software",
  LOGISTICS_TRANSPORT: "Logistics & Transport",
  MANUFACTURING: "Manufacturing",
  MEDIA_ENTERTAINMENT: "Media & Entertainment",
  RETAIL_ECOMMERCE: "Retail & E-commerce",
  TELECOM: "Telecom",
  TEXTILES_APPAREL: "Textiles & Apparel",
  CHEMICALS: "Chemicals",
  METALS_MINING: "Metals & Mining",
  AGRICULTURE_INPUTS: "Agriculture Inputs (Seeds/Fertilizer/Pesticide)",
  JEWELLERY: "Jewellery",
  FURNITURE: "Furniture",
  PACKAGING: "Packaging",
  OTHER: "Other",
};

/**
 * Which CRM operating surface a business runs as. Used to be a choice of
 * three (Brand/SC/POS); BRAND and POS were removed -- zero Business or
 * VendorProfile documents ever used them in production, confirmed live
 * before deletion -- so this is SC-only now. Distinct from `type`/
 * `industry` above (legal structure / sector); this is "how does this
 * business operate."
 */
export const OPERATING_MODES = ["SC"] as const;

export type OperatingMode = (typeof OPERATING_MODES)[number];

export const OPERATING_MODE_LABELS: Record<OperatingMode, string> = {
  SC: "Service Center (single login, work-order flow)",
};

export const OPERATING_MODE_OPTIONS = OPERATING_MODES.map((value) => ({
  value,
  label: OPERATING_MODE_LABELS[value],
}));

export const BUSINESS_TYPE_OPTIONS = BUSINESS_TYPES.map((value) => ({
  value,
  label: BUSINESS_TYPE_LABELS[value],
}));

export const INDUSTRY_OPTIONS = INDUSTRIES.map((value) => ({
  value,
  label: INDUSTRY_LABELS[value],
}));
