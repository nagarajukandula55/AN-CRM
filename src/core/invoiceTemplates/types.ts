/**
 * Shared data shape every invoice layout renders from. This is
 * deliberately the SAME shape /api/invoice/view/[invoiceNumber]/route.ts
 * already builds (company/customer/shipping/payment/items/summary) so no
 * caller needs to reshape data per layout — only `company` grew a
 * `logoUrl` field, and a new top-level `templateConfig` block was added
 * for the admin-editable branding/text from InvoiceTemplate.ts. Nothing
 * else changed, so the existing view route needed only additive changes
 * (see that file's updated comment) rather than a rewrite.
 */

export interface InvoiceRenderData {
  invoiceNumber: string;
  invoiceDate: string | Date;
  orderDate?: string | Date;
  orderId?: string;
  type?: string; // "B2B" | "B2C"
  company: {
    name: string;
    tagline?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    gstin?: string;
    phone?: string;
    logoUrl?: string;
  };
  customer: {
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    gstin?: string;
    stateCode?: string;
  };
  shipping?: {
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  payment?: {
    method?: string;
    status?: string;
    transactionId?: string;
  };
  items: Array<{
    name?: string;
    hsn?: string;
    qty?: number;
    rate?: number;
    discount?: number;
    taxable?: number;
    gstPercent?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    total?: number;
  }>;
  summary?: {
    subtotal?: number;
    discount?: number;
    taxable?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    grandTotal?: number;
  };
  hsnSummary?: Array<{ hsn: string; taxable: number }>;
  placeOfSupply?: string;
  stateCode?: string;
  supplyType?: string;

  /** Admin-editable branding/text, from InvoiceTemplate.ts — all optional, layouts fall back to sensible defaults. */
  templateConfig?: {
    accentColor?: string;
    footerNote?: string;
    declaration?: string;
    termsAndConditions?: string;
    showSignature?: boolean;
    signatureImageUrl?: string;
    signatoryLabel?: string;
  };
}

export interface InvoiceLayout {
  key: string;
  label: string;
  description: string;
  /** Server-renderable HTML string — used for the Cloudinary snapshot / email / any non-React consumer. */
  renderHTML: (data: InvoiceRenderData) => string;
}
