import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Dynamic, DB-backed additions to ANu's knowledge (see core/anu/
 * knowledgeBase.ts's STATIC_KNOWLEDGE for the hand-maintained baseline).
 * Lets an admin "teach ANu" a new fact from the UI without a code deploy —
 * merged into buildAnuContext() alongside the static list at query time.
 * businessId: null means platform-wide (shown to every business, like the
 * static entries); a real businessId scopes it to just that business.
 */
export interface IAnuKnowledge extends Document {
  businessId?: mongoose.Types.ObjectId | null;
  topic: string;
  summary: string;
  addedBy?: string;
  createdAt: Date;
}

const AnuKnowledgeSchema = new Schema<IAnuKnowledge>(
  {
    businessId: { type: Schema.Types.ObjectId, default: null, index: true },
    topic: { type: String, required: true },
    summary: { type: String, required: true },
    addedBy: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const AnuKnowledge: Model<IAnuKnowledge> =
  mongoose.models.AnuKnowledge || mongoose.model<IAnuKnowledge>("AnuKnowledge", AnuKnowledgeSchema);

export default AnuKnowledge;
