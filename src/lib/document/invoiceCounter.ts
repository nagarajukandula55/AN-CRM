import mongoose from "mongoose";

/**
 * Collection:
 * invoice_counters
 */
const CounterSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
  dateKey: { type: String, required: true }, // e.g. 260430
  sequence: { type: Number, default: 0 },
});

CounterSchema.index({ businessId: 1, dateKey: 1 }, { unique: true });

const Counter =
  mongoose.models.InvoiceCounter ||
  mongoose.model("InvoiceCounter", CounterSchema);

/**
 * ATOMIC INCREMENT (SAFE FOR MULTI SERVER / VERCEL)
 */
export async function getNextInvoiceSequence(
  businessId: string,
  dateKey: string
) {
  const result = await Counter.findOneAndUpdate(
    { businessId, dateKey },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );

  return result.sequence;
}
