import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * THE single atomic counter collection for every document type in the
 * platform, replacing FOUR separate counter models that existed before
 * this consolidation (models/Sequence.ts, models/Counter.ts,
 * models/DocumentCounter.ts, models/InvoiceSequence.ts) — each used by a
 * different one of the old duplicate generator functions, none aware of
 * the others, so e.g. an invoice number and a "customer order" number
 * could never accidentally collide with each other's counters but ALSO
 * meant four different collections to reason about for what should be one
 * simple concept: "the next number for X business, Y document type, Z
 * period."
 *
 * One document per (businessId, documentType, periodKey) tuple. periodKey
 * is derived from the business's DocumentNumberConfig for that type
 * (financial year if includeFinancialYear, else a constant "ALL" so the
 * counter never resets) — see numberingService.ts for how periodKey is
 * computed. findOneAndUpdate + $inc is atomic at the MongoDB level, which
 * is what makes this safe under concurrent requests — the property that
 * TWO of the old six generators (sales.service.ts and
 * purchaseOrder.service.ts, both using `"X-" + Date.now()`) and a THIRD
 * (invoice.service.ts, using `countDocuments()`) did not have.
 */
export interface INumberSequence extends Document {
  businessId: mongoose.Types.ObjectId;
  documentType: string;
  periodKey: string; // e.g. "2025-26", or "ALL" if the type doesn't reset by financial year
  value: number;
  createdAt: Date;
  updatedAt: Date;
}

const NumberSequenceSchema = new Schema<INumberSequence>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    documentType: { type: String, required: true, index: true },
    periodKey: { type: String, required: true, default: "ALL" },
    value: { type: Number, default: 0 },
  },
  { timestamps: true }
);

NumberSequenceSchema.index(
  { businessId: 1, documentType: 1, periodKey: 1 },
  { unique: true }
);

const NumberSequence: Model<INumberSequence> =
  (mongoose.models.NumberSequence as Model<INumberSequence>) ||
  mongoose.model<INumberSequence>("NumberSequence", NumberSequenceSchema);

export default NumberSequence;
