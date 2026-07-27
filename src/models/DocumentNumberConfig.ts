import mongoose, { Schema, Model, Document } from "mongoose";
import { DOCUMENT_TYPES, type DocumentType } from "@/core/numbering/types";

/* =========================================================
 * SUPPORTED DOCUMENT TYPES
 *
 * Re-exported from core/numbering/types.ts (the single canonical list,
 * built during the numbering-engine consolidation — see that file's top
 * comment) rather than declared separately here. This used to be its own
 * independent list of 10 types; core/numbering/types.ts's list is a
 * superset (adds PRODUCT, PRODUCT_VARIANT, VENDOR_PRODUCT,
 * STOCK_ADJUSTMENT, STOCK_TRANSFER, BATCH, CUSTOMER_ORDER, RECEIPT — types
 * that generate real documents elsewhere in the app but weren't
 * admin-configurable before this consolidation). Re-exporting instead of
 * duplicating means the admin UI (Settings > Document Numbers), this
 * model, and the numbering engine can never drift out of sync again.
 * =======================================================*/
export { DOCUMENT_TYPES };
export type { DocumentType };

/* =========================================================
 * DOCUMENT
 * =======================================================*/
export interface IDocumentNumberConfig extends Document {
  // Optional — null means this is an AN-Group-wide (platform-level) numbering
  // config rather than one belonging to a single business. Some document
  // types (e.g. AGREEMENT, BUSINESS, VENDOR_REQUEST) are numbered across the
  // whole platform, not per-tenant, so there needs to be a way to save a
  // format config that isn't scoped to any businessId at all. Mirrors the
  // same null-businessId pattern used by Integration and VendorProfile. The
  // API layer accepts a literal 'AN_GROUP' sentinel string (since headers/
  // query params can't cleanly carry a real null) and translates it to
  // businessId: null before hitting this model.
  businessId: string | null;
  documentType: DocumentType;

  // Format building blocks
  prefix: string;            // e.g. "INV", "PO", "GRN"
  separator: string;         // default "-"
  includeFinancialYear: boolean; // e.g. "2024-25"
  // "hyphenated" -> "2024-25" (the format this field's name and every
  // other doc-comment in this model always implied); "compact" -> "2425"
  // for anyone who prefers the shorter form. Was previously hardcoded to
  // compact in the generator regardless of this setting -- see
  // core/numbering/numberingService.ts's history.
  financialYearFormat: "hyphenated" | "compact";
  includeMonth: boolean;     // e.g. "06"
  sequenceLength: number;    // zero-pad length, default 4
  suffix: string;            // optional suffix after sequence

  // Custom template (optional) — when set, overrides the structured
  // prefix/separator/fy/month/seq/suffix builder entirely. Supports
  // placeholder tokens: {prefix} {fy} {month} {year} {seq} {suffix}, plus
  // arbitrary caller-supplied tokens like {vendorId}, {customerId},
  // {businessCode}, and every other document type's own number under its
  // DOCUMENT_NUMBER_TOKENS name (e.g. {invoiceNumber}, {grnNumber} — see
  // core/numbering/types.ts) for document types whose generating code
  // passes that context (see generateDocumentNumber's `context` param) —
  // e.g. vendor product codes pass {vendorId} so every vendor's own code
  // appears in their products' numbers instead of a fixed literal. A token
  // with no matching context at generation time renders as "" rather than
  // throwing (see numberingService.ts's renderTemplate) — most (type,
  // token) combinations have no real relationship and are expected to
  // never be supplied.
  template: string;

  // Control
  startFrom: number;         // reset/start from this number
  isActive: boolean;

  // Computed preview (stored for display, recalculated on save)
  formatPreview: string;     // e.g. "INV-2024-25-0001"

  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
 * SCHEMA
 * =======================================================*/
const DocumentNumberConfigSchema = new Schema<IDocumentNumberConfig>(
  {
    businessId: { type: String, default: null, index: true },
    documentType: {
      type: String,
      enum: DOCUMENT_TYPES,
      required: true,
    },
    prefix: { type: String, default: "" },
    separator: { type: String, default: "-" },
    includeFinancialYear: { type: Boolean, default: true },
    financialYearFormat: { type: String, enum: ["hyphenated", "compact"], default: "hyphenated" },
    includeMonth: { type: Boolean, default: false },
    sequenceLength: { type: Number, default: 4, min: 1, max: 8 },
    suffix: { type: String, default: "" },
    template: { type: String, default: "" },
    startFrom: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    formatPreview: { type: String, default: "" },
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  { timestamps: true, versionKey: false }
);

DocumentNumberConfigSchema.index(
  { businessId: 1, documentType: 1 },
  { unique: true }
);

/* =========================================================
 * MODEL
 * =======================================================*/
const DocumentNumberConfig: Model<IDocumentNumberConfig> =
  (mongoose.models.DocumentNumberConfig as Model<IDocumentNumberConfig>) ||
  mongoose.model<IDocumentNumberConfig>(
    "DocumentNumberConfig",
    DocumentNumberConfigSchema
  );

export default DocumentNumberConfig;
