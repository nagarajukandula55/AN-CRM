import mongoose from "mongoose";

/**
 * Collection: invoice_sequences
 */
const SequenceSchema = new mongoose.Schema({
  businessId: String,
  dateKey: String,
  seq: { type: Number, default: 0 },
});

const SequenceModel =
  mongoose.models.InvoiceSequence ||
  mongoose.model("InvoiceSequence", SequenceSchema);

export async function getNextInvoiceSequence(
  businessId: string,
  dateKey: string
): Promise<number> {
  const result = await SequenceModel.findOneAndUpdate(
    {
      businessId,
      dateKey,
    },
    {
      $inc: { seq: 1 },
      $setOnInsert: {
        businessId,
        dateKey,
      },
    },
    {
      new: true,
      upsert: true,
    }
  ).exec();

  return result?.seq || 1;
}
