import mongoose, { Schema, Model, Document } from "mongoose";

/* =========================================================
 * DOCUMENT
 * =======================================================*/
export interface IDocumentCounter extends Document {
  businessId: string;
  documentType: string;   // e.g. "INVOICE", "ORDER", "PO", "GRN"
  financialYear: string;  // e.g. "2024-25"
  prefix: string;         // e.g. "INV", "ORD"
  current: number;        // current (latest used) sequence number
}

/* =========================================================
 * SCHEMA
 * =======================================================*/
const DocumentCounterSchema = new Schema<IDocumentCounter>(
  {
    businessId: { type: String, required: true, index: true },
    documentType: { type: String, required: true },
    financialYear: { type: String, required: true },
    prefix: { type: String, default: "" },
    current: { type: Number, default: 0 },
  },
  { timestamps: false, versionKey: false }
);

DocumentCounterSchema.index(
  { businessId: 1, documentType: 1, financialYear: 1 },
  { unique: true }
);

/* =========================================================
 * MODEL
 * =======================================================*/
const DocumentCounter: Model<IDocumentCounter> =
  (mongoose.models.DocumentCounter as Model<IDocumentCounter>) ||
  mongoose.model<IDocumentCounter>("DocumentCounter", DocumentCounterSchema);

export default DocumentCounter;
