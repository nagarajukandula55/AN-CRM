import mongoose, { Schema, Model, Document } from "mongoose";

/**
 * One shared model for the 5 lightweight, party-facing document types the
 * system didn't have any record/CRUD for at all until now: Quotation,
 * Delivery Challan, Credit Note, Debit Note, Proforma Invoice. All 5 share
 * the exact same shape (a party, line items, totals, a status) and none of
 * them warranted their own model/API/page trio — that would just be the
 * same code times five. `docType` is what a page filters/creates against;
 * see app/admin/quotations, delivery-challans, credit-notes, debit-notes,
 * proforma-invoices (thin wrappers around one shared list/create/print
 * implementation, src/components/admin/SalesDocumentManager.tsx).
 *
 * Credit/Debit Notes are usually issued AGAINST an existing SalesInvoice
 * (adjusting it up or down) -- referenceInvoiceId is optional and only
 * meaningful for those two types; Quotation/Proforma/Delivery-Challan
 * leave it unset.
 */

export type SalesDocumentType =
  | "QUOTATION"
  | "DELIVERY_CHALLAN"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "PROFORMA_INVOICE";

export const SALES_DOCUMENT_TYPES: SalesDocumentType[] = [
  "QUOTATION",
  "DELIVERY_CHALLAN",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "PROFORMA_INVOICE",
];

export type SalesDocumentStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "CANCELLED";

export interface ISalesDocumentItem {
  description: string;
  hsnCode?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxRate: number;
}

export interface ISalesDocument extends Document {
  businessId: mongoose.Types.ObjectId;
  docType: SalesDocumentType;
  docNumber: string;
  party: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
  };
  items: ISalesDocumentItem[];
  subtotal: number;
  taxTotal: number;
  discountAmount: number;
  grandTotal: number;
  status: SalesDocumentStatus;
  /** Only meaningful for CREDIT_NOTE / DEBIT_NOTE — the SalesInvoice this adjusts. */
  referenceInvoiceId?: mongoose.Types.ObjectId;
  notes?: string;
  createdBy: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SalesDocumentItemSchema = new Schema<ISalesDocumentItem>(
  {
    description: { type: String, required: true },
    hsnCode: { type: String },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String },
    unitPrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0 },
  },
  { _id: false }
);

const SalesDocumentSchema = new Schema<ISalesDocument>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    docType: { type: String, enum: SALES_DOCUMENT_TYPES, required: true, index: true },
    docNumber: { type: String, required: true },
    party: {
      name: { type: String, required: true },
      address: { type: String },
      phone: { type: String },
      email: { type: String },
      gstin: { type: String },
    },
    items: { type: [SalesDocumentItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "CANCELLED"],
      default: "DRAFT",
    },
    referenceInvoiceId: { type: Schema.Types.ObjectId, ref: "SalesInvoice", default: null },
    notes: { type: String },
    createdBy: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SalesDocumentSchema.index({ businessId: 1, docType: 1, docNumber: 1 }, { unique: true });
SalesDocumentSchema.index({ businessId: 1, docType: 1, isDeleted: 1, createdAt: -1 });

const SalesDocument: Model<ISalesDocument> =
  (mongoose.models.SalesDocument as Model<ISalesDocument>) ||
  mongoose.model<ISalesDocument>("SalesDocument", SalesDocumentSchema);

export default SalesDocument;
