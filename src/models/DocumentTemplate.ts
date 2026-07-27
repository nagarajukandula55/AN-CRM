/**
 * DocumentTemplate — a generalized, drag-and-drop-composable template
 * system covering every business document type (invoice, purchase order,
 * quotation, delivery challan, credit note, proforma invoice), unlike
 * InvoiceTemplate.ts which only covers ecommerce invoices via 3 fixed,
 * hardcoded HTML layouts (see that file's own comment — it deliberately
 * scoped out freeform drag-and-drop as "a much bigger, separate project").
 *
 * This model is that bigger project, built additively alongside the
 * existing invoice system rather than replacing it — InvoiceTemplate /
 * core/invoiceTemplates/* keep working exactly as before for the
 * ecommerce invoice page. DocumentTemplate is what every OTHER document
 * type (and, going forward, new invoice designs) uses.
 *
 * A template here is an ordered list of BLOCKS the admin drags/reorders
 * in the builder UI (see admin/document-templates/page.tsx). Each block
 * has a `type` (from a small fixed palette — header, company-details,
 * party-details, items-table, totals, terms, signature, custom-text,
 * spacer) and a JSON `config` whose shape depends on the type. The
 * builder never lets an admin write arbitrary HTML/CSS (that would be a
 * GrapesJS-style freeform page designer, a different and much larger
 * project) — it composes from this fixed block palette, which is what
 * "drag and drop template builder" means in every ask from the user for
 * this feature (reorder/configure sections, not free-form page design).
 */

import mongoose, { Schema, Model, Document } from "mongoose";

export type DocumentTemplateType =
  | "INVOICE"
  | "PURCHASE_ORDER"
  | "QUOTATION"
  | "DELIVERY_CHALLAN"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "PROFORMA_INVOICE"
  | "WORK_ORDER"
  | "ESTIMATE"
  // Added alongside real print pages for each (these DO have real, existing
  // records the system already generates, just no print page until now).
  | "SALES_ORDER"
  | "STOCK_TRANSFER"
  | "STOCK_ADJUSTMENT"
  | "PRODUCTION_ORDER"
  | "GRN"
  // The service report printed once a CRM job sheet closes -- was a fully
  // hardcoded page (print/jobsheets/[id]/service-record) until now; onto
  // the same drag-and-drop template system as WORK_ORDER/ESTIMATE so a
  // business can design/pick its own layout instead of one fixed one.
  | "SERVICE_RECORD";

export const DOCUMENT_TEMPLATE_TYPES: DocumentTemplateType[] = [
  "INVOICE",
  "PURCHASE_ORDER",
  "QUOTATION",
  "DELIVERY_CHALLAN",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "PROFORMA_INVOICE",
  "WORK_ORDER",
  "ESTIMATE",
  "SALES_ORDER",
  "STOCK_TRANSFER",
  "STOCK_ADJUSTMENT",
  "PRODUCTION_ORDER",
  "GRN",
  "SERVICE_RECORD",
];

export type TemplateBlockType =
  | "header"
  | "company-details"
  | "party-details"
  | "items-table"
  | "totals"
  | "terms"
  | "signature"
  | "custom-text"
  | "spacer";

export const TEMPLATE_BLOCK_TYPES: TemplateBlockType[] = [
  "header",
  "company-details",
  "party-details",
  "items-table",
  "totals",
  "terms",
  "signature",
  "custom-text",
  "spacer",
];

export interface ITemplateBlock {
  /** Stable id for this block instance within the template (for DnD keying, not global). */
  id: string;
  type: TemplateBlockType;
  /** Free-form per-block settings — e.g. { title, columns } for items-table, { text } for custom-text. */
  config?: Record<string, unknown>;
}

export interface IDocumentTemplate extends Document {
  businessId: mongoose.Types.ObjectId;
  documentType: DocumentTemplateType;
  name: string;
  isDefault: boolean;
  /** Ordered — this order IS the rendered layout order. */
  blocks: ITemplateBlock[];
  accentColor: string;
  logoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TemplateBlockSchema = new Schema<ITemplateBlock>(
  {
    id: { type: String, required: true },
    type: { type: String, enum: TEMPLATE_BLOCK_TYPES, required: true },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const DocumentTemplateSchema = new Schema<IDocumentTemplate>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    documentType: { type: String, enum: DOCUMENT_TEMPLATE_TYPES, required: true, index: true },
    name: { type: String, required: true, default: "Default" },
    isDefault: { type: Boolean, default: false },
    blocks: { type: [TemplateBlockSchema], default: [] },
    accentColor: { type: String, default: "#111827" },
    logoUrl: { type: String },
  },
  { timestamps: true }
);

// At most one default per (business, documentType).
DocumentTemplateSchema.index(
  { businessId: 1, documentType: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

const DocumentTemplate: Model<IDocumentTemplate> =
  (mongoose.models.DocumentTemplate as Model<IDocumentTemplate>) ||
  mongoose.model<IDocumentTemplate>("DocumentTemplate", DocumentTemplateSchema);

export default DocumentTemplate;
