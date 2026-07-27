import type { Industry } from "@/data/businessConstants";

/**
 * Maps a business's industry to the domain-specific compliance documents a
 * vendor onboarding under that business should be asked to upload, per
 * Indian regulatory requirements (e.g. an FSSAI license for any food/FMCG
 * business, a Drug License for pharma, etc.).
 *
 * Deliberately data-driven rather than hardcoded per-industry UI branches —
 * add a new industry's required docs here and every vendor onboarding form
 * that reads this list picks it up automatically.
 */
export interface ComplianceDocRequirement {
  /** Stable machine key — used as the key in VendorProfile.documents.compliance. */
  key: string;
  label: string;
  /** Short explanation shown next to the upload field. */
  helpText?: string;
  /** Whether this document should also collect a license/registration number, not just a file. */
  collectNumber?: boolean;
  numberLabel?: string;
}

/** A doc catalog entry plus whether it's mandatory by default. */
export interface CatalogDocEntry extends ComplianceDocRequirement {
  mandatoryByDefault: boolean;
}

/**
 * The fixed catalog of general (non-industry-specific) vendor documents
 * every business can choose from. Which of these are actually MANDATORY
 * is now configurable per business (Business.vendorDocumentRequirements,
 * edited from that business's admin page) instead of hardcoded here --
 * mandatoryByDefault is only the fallback used when a business hasn't set
 * its own override for a given key.
 *
 * FSSAI is deliberately NOT mandatory by default (it doesn't apply to
 * every business) -- a business that needs it can mark it mandatory for
 * itself from its own settings.
 */
export const VENDOR_DOC_CATALOG: CatalogDocEntry[] = [
  {
    key: "gst_certificate",
    label: "GST Certificate",
    helpText: "GST registration certificate for this vendor's business.",
    collectNumber: true,
    numberLabel: "GSTIN",
    mandatoryByDefault: true,
  },
  {
    key: "pan_card",
    label: "PAN Card",
    helpText: "PAN of the vendor business or proprietor.",
    collectNumber: true,
    numberLabel: "PAN Number",
    mandatoryByDefault: true,
  },
  {
    key: "msme_certificate",
    label: "MSME (Udyam) Registration",
    helpText: "MSME/Udyam registration certificate, if the vendor is registered as an MSME.",
    collectNumber: true,
    numberLabel: "Udyam Registration Number",
    mandatoryByDefault: true,
  },
  {
    key: "fssai_license",
    label: "FSSAI License",
    helpText: "Required under the Food Safety and Standards Act -- only applies to food/beverage businesses. Not mandatory by default; a business can require it from its own settings.",
    collectNumber: true,
    numberLabel: "FSSAI License Number",
    mandatoryByDefault: false,
  },
  {
    key: "trade_license",
    label: "Trade License",
    helpText: "Local municipal trade license, if this vendor's business has one.",
    collectNumber: true,
    numberLabel: "Trade License Number",
    mandatoryByDefault: false,
  },
];

/**
 * Business-configurable: given a business's saved overrides (or none, for
 * the catalog defaults), returns the full catalog split into required vs
 * optional for that business.
 */
export function getVendorDocRequirements(
  businessOverrides?: { key: string; mandatory: boolean }[] | null
): { required: ComplianceDocRequirement[]; optional: ComplianceDocRequirement[] } {
  const overrideMap = new Map((businessOverrides || []).map((o) => [o.key, o.mandatory]));
  const required: ComplianceDocRequirement[] = [];
  const optional: ComplianceDocRequirement[] = [];
  for (const doc of VENDOR_DOC_CATALOG) {
    const isMandatory = overrideMap.has(doc.key) ? overrideMap.get(doc.key)! : doc.mandatoryByDefault;
    (isMandatory ? required : optional).push(doc);
  }
  return { required, optional };
}

export const INDUSTRY_COMPLIANCE_DOCS: Partial<Record<Industry, ComplianceDocRequirement[]>> = {
  HEALTHCARE_PHARMA: [
    {
      key: "drug_license",
      label: "Drug License",
      helpText: "Required under the Drugs and Cosmetics Act for pharmaceutical/healthcare product vendors.",
      collectNumber: true,
      numberLabel: "Drug License Number",
    },
  ],
  CHEMICALS: [
    {
      key: "pollution_control_clearance",
      label: "Pollution Control Board Clearance",
      helpText: "Required for vendors handling or supplying chemical products.",
      collectNumber: false,
    },
  ],
  CONSTRUCTION_REAL_ESTATE: [
    {
      key: "rera_registration",
      label: "RERA Registration",
      helpText: "Required for vendors involved in real estate development/sale.",
      collectNumber: true,
      numberLabel: "RERA Registration Number",
    },
  ],
};

/** Returns only the industry-specific compliance doc requirements, or an empty list if none apply. */
export function getComplianceDocsForIndustry(industry?: string | null): ComplianceDocRequirement[] {
  if (!industry) return [];
  return INDUSTRY_COMPLIANCE_DOCS[industry as Industry] || [];
}

/**
 * Full picture for one business: catalog docs split by this business's own
 * mandatory/optional overrides, plus industry-specific docs (always
 * mandatory -- these are legal requirements tied to the industry, not a
 * business preference) appended to the required list.
 */
export function getRequiredVendorDocs(
  industry?: string | null,
  businessOverrides?: { key: string; mandatory: boolean }[] | null
): { required: ComplianceDocRequirement[]; optional: ComplianceDocRequirement[] } {
  const { required, optional } = getVendorDocRequirements(businessOverrides);
  return { required: [...required, ...getComplianceDocsForIndustry(industry)], optional };
}
