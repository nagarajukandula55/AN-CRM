/**
 * Generic shape every document type (invoice, workorder, estimate, and any
 * future DocumentTemplate-backed doc) maps into before rendering — lets
 * renderer.tsx have exactly one implementation of each block type instead
 * of one per document type.
 */
export interface DocumentRenderItem {
  description: string;
  hsnCode?: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  taxRate: number;
  amount: number;
  /** Per-line CGST/SGST or IGST split (only one pair non-zero) -- shown as
   * its own columns in the items table when present, same source-of-truth
   * fields SalesInvoice.items already carries. */
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  /** Fault Phenomenon/Symptom/Solution codes for this line, when the
   * source line item has them set -- currently only CrmJobSheet line
   * items carry these (see jobSheetToRenderData). */
  diagnosis?: string;
}

export interface DocumentRenderData {
  docTypeLabel: string;
  docNumber: string;
  date: string;
  status?: string;
  company: {
    name: string;
    address?: string;
    /** Service center (Warehouse.mobile) when the document was issued from
     * one -- see businessToCompany's own comment. */
    phone?: string;
    gstin?: string;
    logoUrl?: string;
    /** Vendor-wide Terms & Conditions (Business.termsAndConditions, set
     * from the vendor Owner/Manager's profile page) -- the "terms" block's
     * fallback text when the document itself has no notes of its own. */
    termsAndConditions?: string;
    /** Business.documentSignatureUrl, set from Vendor Settings > Signature.
     * Blank means the "signature" block prints a digital-document notice
     * instead of a signature image -- see the "signature" case in
     * renderer.tsx. */
    signatureUrl?: string;
    /** Name shown alongside "Authorized Signatory" on the signature
     * block's left side -- e.g. the CCO who logged a job sheet, so a
     * physical printout has an actual name to sign against, not just a
     * blank title. Undefined leaves the signature block exactly as it was
     * for every document type that doesn't set this (invoices, POs, etc.). */
    signedByName?: string;
  };
  party: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
  };
  items: DocumentRenderItem[];
  totals: {
    subtotal: number;
    tax: number;
    discount?: number;
    grandTotal: number;
    /** CGST/SGST (intrastate) or IGST (interstate) split of `tax` above --
     * only one pair is ever non-zero per the standard GST intrastate/
     * interstate rule. Undefined/all-zero falls back to the old flat
     * "Tax" line (renderer.tsx's "totals" case). */
    cgst?: number;
    sgst?: number;
    igst?: number;
  };
  notes?: string;
  footerText?: string;
  /** Device identity, shown as its own labelled row on Workorder/Service
   * Record prints (borrowed from the OnePlus-style service-report layout
   * the business asked us to match) instead of being buried in the
   * free-text notes block. */
  device?: {
    model?: string;
    brand?: string;
    imeiOrSerial?: string;
  };
  /** Rendered as a bordered footer strip (address/phone/hours/hotline) at
   * the bottom of Workorder/Service Record prints, matching the reference
   * layout's service-center footer band. */
  footerBand?: {
    address?: string;
    phone?: string;
    hours?: string;
    hotline?: string;
  };
}
