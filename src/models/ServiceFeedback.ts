/**
 * Post-service NPS feedback -- one submission per CrmJobSheet, collected
 * via a public (no-login) survey link sent ~1 hour after device handover/
 * repair completion (see api/cron/service-feedback-followup/route.ts).
 * Distinct from models/Feedback.ts, which is in-app product feedback about
 * AN-CRM itself from a logged-in staff user, not a customer NPS score.
 */
import mongoose, { Schema, Model, Document, Types } from "mongoose";

export interface IServiceFeedback extends Document {
  businessId: Types.ObjectId;
  jobSheetId: Types.ObjectId;
  customerName: string;
  customerPhone: string;
  // Standard 0-10 NPS scale.
  npsScore: number;
  comment?: string;
  createdAt: Date;
}

const ServiceFeedbackSchema = new Schema<IServiceFeedback>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    jobSheetId: { type: Schema.Types.ObjectId, ref: "CrmJobSheet", required: true, unique: true },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    npsScore: { type: Number, required: true, min: 0, max: 10 },
    comment: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const ServiceFeedback: Model<IServiceFeedback> =
  (mongoose.models.ServiceFeedback as Model<IServiceFeedback>) ||
  mongoose.model<IServiceFeedback>("ServiceFeedback", ServiceFeedbackSchema);

export default ServiceFeedback;
