/**
 * Shared "business tagging" convention for catalog reference data (Brand,
 * ProductCategory, MaterialCategory, FaultCode, Solution): a record is
 * either scoped to its one owning businessId (SINGLE, the default -- every
 * pre-existing document behaves exactly as before), to a specific list of
 * additional businesses (MULTIPLE, via businessIds), or visible to every
 * business (ALL). No prior model in this codebase supported more than one
 * business, so this is a new, additive convention -- the existing single
 * `businessId` field is untouched and keeps being read for the SINGLE case.
 */
export const BUSINESS_SCOPES = ["SINGLE", "MULTIPLE", "ALL"] as const;
export type BusinessScope = (typeof BUSINESS_SCOPES)[number];
