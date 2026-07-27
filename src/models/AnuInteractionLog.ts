import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Append-only log of every question ANu was asked and how it answered.
 * This is the "natural learning" layer: buildAnuContext() pulls the most
 * recent entries for a business back in as light-weight memory, so ANu
 * feels continuous across separate widget sessions instead of starting
 * from zero every time the panel is reopened. Not curated/editable like
 * AnuKnowledge (that's the deliberate "teach ANu a fact" path) — this is
 * just raw history, kept simple on purpose.
 */
export interface IAnuInteractionLog extends Document {
  businessId?: mongoose.Types.ObjectId | null;
  userId?: mongoose.Types.ObjectId | null;
  question: string;
  answer: string;
  createdAt: Date;
}

const AnuInteractionLogSchema = new Schema<IAnuInteractionLog>(
  {
    businessId: { type: Schema.Types.ObjectId, default: null, index: true },
    userId: { type: Schema.Types.ObjectId, default: null },
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AnuInteractionLogSchema.index({ businessId: 1, createdAt: -1 });

const AnuInteractionLog: Model<IAnuInteractionLog> =
  mongoose.models.AnuInteractionLog ||
  mongoose.model<IAnuInteractionLog>("AnuInteractionLog", AnuInteractionLogSchema);

export default AnuInteractionLog;
