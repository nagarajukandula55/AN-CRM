import mongoose, { Schema, Document, Model } from "mongoose";

export interface IHrDocument extends Document {
  businessId: mongoose.Types.ObjectId;
  name: string;
  type: string;
  employeeName: string;
  fileUrl?: string;
  fileSize?: number;
  expiresAt?: Date;
  uploadedAt: Date;
}

const HrDocumentSchema = new Schema<IHrDocument>({
  businessId: { type: Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  employeeName: { type: String, required: true },
  fileUrl: { type: String },
  fileSize: { type: Number },
  expiresAt: { type: Date },
  uploadedAt: { type: Date, default: Date.now },
});

HrDocumentSchema.index({ businessId: 1, uploadedAt: -1 });

const HrDocument: Model<IHrDocument> =
  mongoose.models.HrDocument || mongoose.model<IHrDocument>("HrDocument", HrDocumentSchema);

export default HrDocument;
