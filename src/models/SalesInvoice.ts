/**
 * SalesInvoice — canonical model for sales invoices.
 *
 * This schema used to be defined inline, separately, in BOTH
 * src/app/api/sales/invoices/route.ts and
 * src/app/api/sales/invoices/[id]/route.ts (the only 2 route files under
 * that path that actually exist — an earlier version of this comment
 * claimed 4, including a [id]/share/route.ts and [id]/mark-paid/route.ts
 * that don't exist in this codebase; corrected here). Both used
 * `mongoose.models.SalesInvoice || mongoose.model("SalesInvoice", InvoiceSchema)`,
 * which prevented Mongoose's OverwriteModelError but meant whichever route
 * loaded first silently won the model registration for the whole app —
 * the other file's schema definition was dead weight while still looking
 * like it controlled its own data shape.
 *
 * IMPORTANT: the two inline copies weren't just textually duplicated —
 * app/api/sales/invoices/route.ts's version had a materially DIFFERENT
 * shape: a full India-GST split (supplyType, placeOfSupply, per-item
 * hsnCode/cgstRate/cgstAmount/sgstRate/sgstAmount/igstRate/igstAmount, and
 * invoice-level cgstTotal/sgstTotal/igstTotal), none of which existed on
 * this canonical model's original flat taxTotal-only shape. Simply
 * pointing that route at this file without extending it first would have
 * silently dropped GST-breakdown data on every future invoice — a real
 * data-loss risk, not just a style cleanup. All the GST-specific fields
 * below were added (as optional, additive fields) specifically to make
 * that route's actual data shape a strict subset of this schema before
 * switching it over — see the tax-split fields marked "GST breakdown"
 * below. Both routes now import this file instead of declaring their own
 * copy — this really is the single source of truth now, not just
 * documented as one.
 *
 * API routes can import this model via:
 *   import SalesInvoice from "@/models/SalesInvoice";
 *
 * ── e-Invoice (IRN) readiness ─────────────────────────────────────────
 * Per explicit user decision: target ONLY the official government e-invoice
 * (IRN) system for now — the free, government-authorized Invoice
 * Registration Portal APIs (see PROGRESS.md's GST section for the research
 * on NIC vs. IRIS/Clear IRP and turnover eligibility) — and hold off on
 * wiring an actual IRP integration until that's revisited. This model was
 * extended additively with every mandatory field the official e-invoice
 * schema (FORM GST INV-01) requires that this schema didn't already have,
 * so invoice data is READY to be mapped into an IRN request the moment
 * that integration is built — no schema migration needed at that point.
 * Nothing here calls any IRP; this is purely data-shape preparation.
 * New fields: documentTypeCode, isService (invoice-level); recipient
 * address/state code (needed for place-of-supply on the e-invoice JSON,
 * distinct from the free-text `customer.address` already present);
 * assessableValue (per item — INV-01's term for taxable value after
 * discount, distinct from the pre-discount `total` this schema already
 * tracks); and the post-filing response fields (irn, ackNumber, ackDate,
 * signedQrCode, einvoiceStatus) that will hold the IRP's response once
 * that integration exists.
 */

import mongoose, { Schema, Model, Document } from "mongoose";

export interface ISalesInvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  // ── GST breakdown (optional — only populated by the India-GST-aware
  // creation path in app/api/sales/invoices/route.ts; other callers can
  // leave these unset and rely on taxRate/taxAmount alone) ──────────────
  hsnCode?: string;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  // ── e-Invoice (INV-01) readiness — see this file's top comment ────────
  /** INV-01's "Assessable Value": taxable value for this line after discount, before tax. */
  assessableValue?: number;
  /** Per-unit serial/IMEI numbers for this line -- required for offline
   * sales of serialized goods (see api/vendor/offline-sales/route.ts). */
  serialNumbers?: string[];
}

export interface ISalesInvoice extends Document {
  invoiceNumber: string;
  businessId?: mongoose.Types.ObjectId;
  warehouseId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  /** B2B = vendor → business (purchase side); B2C = business → end customer */
  invoiceType?: "B2B" | "B2C" | "STANDARD";
  vendorId?: mongoose.Types.ObjectId;
  sourceOrderId?: string;
  customer: {
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    gstin?: string;
    // ── e-Invoice (INV-01) readiness — see this file's top comment ──────
    /** Recipient's 2-digit GST state code, e.g. "27" for Maharashtra — distinct from the free-text `state` name. */
    stateCode?: string;
    state?: string;
    pincode?: string;
  };
  items: ISalesInvoiceItem[];
  subtotal: number;
  taxTotal: number;
  discountAmount: number;
  grandTotal: number;
  currency: string;
  notes?: string;
  terms?: string;
  dueDate?: Date;
  issueDate: Date;
  /**
   * FAILED/PARTIAL added when Invoice.ts (the older ecommerce/order invoice
   * model) was merged into this one — those two values covered payment
   * outcomes Invoice.ts's separate `paymentStatus` field tracked that this
   * model's status didn't have room for. Kept on this same `status` field
   * rather than reintroducing a second parallel field, since every other
   * value here already doubles as both document-lifecycle AND payment
   * state (SENT ~ awaiting payment, PAID ~ paid).
   */
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED" | "FAILED" | "PARTIAL";
  /**
   * "Locked" (Invoice.ts) meant "finalized, cannot be edited" — a distinct
   * concept from lifecycle status, not a stage in it, so it's a separate
   * boolean rather than a `status` value.
   */
  isLocked?: boolean;
  /** Soft-delete flag — added during the Invoice.ts merge so finance
   * routes filtering on `isDeleted: false` actually match documents. */
  isDeleted?: boolean;
  /** URL of the generated invoice PDF/HTML, if one has been rendered. */
  pdfUrl?: string;
  shareToken?: string;
  shareExpiry?: Date;
  paidAt?: Date;
  paidAmount?: number;
  paymentMethod?: string;
  paymentRef?: string;
  // ── GST breakdown (optional — see ISalesInvoiceItem's comment above) ──
  supplyType?: "INTRASTATE" | "INTERSTATE";
  placeOfSupply?: string;
  cgstTotal?: number;
  sgstTotal?: number;
  igstTotal?: number;
  // ── e-Invoice (INV-01) readiness — see this file's top comment ────────
  /** INV-01's Document Type Code: INV (regular), CRN (credit note), DBN (debit note). */
  documentTypeCode?: "INV" | "CRN" | "DBN";
  /** INV-01's Is_Service flag — whether this invoice is for a service rather than goods. */
  isService?: boolean;
  /** Populated once a real IRP integration files this invoice and returns a response. All undefined until then. */
  irn?: string;
  ackNumber?: string;
  ackDate?: Date;
  signedQrCode?: string;
  einvoiceStatus?: "NOT_FILED" | "PENDING" | "FILED" | "FAILED" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema = new Schema<ISalesInvoice>(
  {
    invoiceNumber: { type: String },
    businessId: { type: Schema.Types.ObjectId },
    // Service center this invoice was issued from -- optional; when set,
    // its Warehouse.logoUrl overrides the business logo on the printed
    // invoice. See core/documentTemplates/resolve.ts.
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", default: null },
    createdBy: { type: Schema.Types.ObjectId },
    invoiceType: {
      type: String,
      enum: ["B2B", "B2C", "STANDARD"],
      default: "STANDARD",
      index: true,
    },
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", default: null },
    sourceOrderId: { type: String, default: null, index: true },

    customer: {
      name: { type: String, required: true },
      company: { type: String },
      email: { type: String },
      phone: { type: String },
      address: { type: String },
      city: { type: String },
      gstin: { type: String },
      // e-Invoice (INV-01) readiness — see this file's top comment
      stateCode: { type: String },
      state: { type: String },
      pincode: { type: String },
    },

    items: [
      {
        description: String,
        quantity: { type: Number, default: 1 },
        unit: { type: String, default: "pcs" },
        unitPrice: { type: Number, default: 0 },
        taxRate: { type: Number, default: 0 },
        taxAmount: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        // GST breakdown — optional, see ISalesInvoiceItem's comment above
        hsnCode: { type: String, default: "" },
        cgstRate: { type: Number, default: 0 },
        cgstAmount: { type: Number, default: 0 },
        sgstRate: { type: Number, default: 0 },
        sgstAmount: { type: Number, default: 0 },
        igstRate: { type: Number, default: 0 },
        igstAmount: { type: Number, default: 0 },
        // e-Invoice (INV-01) readiness — see this file's top comment
        assessableValue: { type: Number, default: 0 },
        // Per-unit serial/IMEI numbers -- required for offline sales of
        // serialized goods, see api/vendor/offline-sales/route.ts.
        serialNumbers: { type: [String], default: [] },
      },
    ],

    subtotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    currency: { type: String, default: "INR" },
    notes: { type: String },
    terms: { type: String },
    dueDate: { type: Date },
    issueDate: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED", "FAILED", "PARTIAL"],
      default: "DRAFT",
    },
    isLocked: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    pdfUrl: { type: String },

    shareToken: { type: String, index: true, sparse: true },
    shareExpiry: { type: Date },

    paidAt: { type: Date },
    paidAmount: { type: Number, default: 0 },
    paymentMethod: { type: String },
    paymentRef: { type: String },

    // ── GST breakdown (optional) ──────────────────────────────────────
    supplyType: { type: String, enum: ["INTRASTATE", "INTERSTATE"], default: "INTRASTATE" },
    placeOfSupply: { type: String },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },

    // ── e-Invoice (INV-01) readiness (see this file's top comment) ─────
    documentTypeCode: { type: String, enum: ["INV", "CRN", "DBN"], default: "INV" },
    isService: { type: Boolean, default: false },
    irn: { type: String, sparse: true, index: true },
    ackNumber: { type: String },
    ackDate: { type: Date },
    signedQrCode: { type: String },
    einvoiceStatus: {
      type: String,
      enum: ["NOT_FILED", "PENDING", "FILED", "FAILED", "CANCELLED"],
      default: "NOT_FILED",
    },
  },
  { timestamps: true }
);

// Multi-tenant hot path: invoice lists are always filtered by businessId
// and sorted newest-first. Without this index every load is a full scan.
InvoiceSchema.index({ businessId: 1, createdAt: -1 });
InvoiceSchema.index({ businessId: 1, status: 1 });
InvoiceSchema.index({ businessId: 1, isDeleted: 1 });

// invoiceNumber used to carry a bare schema-level `unique: true` -- a
// GLOBAL constraint across every business. Numbering (numberingService.ts)
// resets its counter per business, so two businesses both on the default
// (uncustomized) invoice prefix generate identical-looking numbers (e.g.
// "INV-2025-0001") and the second business's very first invoice creation
// would hard-fail on a duplicate-key error. Scoped to per-business here;
// sparse because invoiceNumber can be unset on drafts and businessId is
// optional on this schema (see its own field comment).
InvoiceSchema.index({ businessId: 1, invoiceNumber: 1 }, { unique: true, sparse: true });

const SalesInvoice: Model<ISalesInvoice> =
  (mongoose.models.SalesInvoice as Model<ISalesInvoice>) ||
  mongoose.model<ISalesInvoice>("SalesInvoice", InvoiceSchema);

export default SalesInvoice;
