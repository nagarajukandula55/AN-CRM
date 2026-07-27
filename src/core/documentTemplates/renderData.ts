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
  };
  notes?: string;
  footerText?: string;
}
