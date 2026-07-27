/**
 * Feedback — general customer feedback / "Contact Us" submissions.
 *
 * Native's frontend (lib/an-sdk/contact.ts) posts { name, email, phone,
 * message } to POST /api/contact with no businessId in the payload (see
 * lib/an-sdk/client.ts / contact.ts — nothing there stamps one). Rather than
 * rejecting every submission, /api/contact/route.ts defaults businessId to
 * the Native storefront's Business._id (same convention as
 * services/order.service.ts's NATIVE_BUSINESS_ID), while still accepting an
 * explicit businessId in the body for any other future caller.
 *
 * This is deliberately a separate model from Review — reviews are
 * per-product ratings, this is general contact-us correspondence with no
 * product linkage.
 */

import mongoose, { Schema, Model, Document } from "mongoose";

export type FeedbackStatus = "NEW" | "READ" | "RESOLVED";

export interface IFeedback extends Document {
  businessId: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  message: string;
  status: FeedbackStatus;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["NEW", "READ", "RESOLVED"],
      default: "NEW",
      index: true,
    },
    source: { type: String, default: "contact-form" },
  },
  { timestamps: true }
);

FeedbackSchema.index({ businessId: 1, status: 1, createdAt: -1 });

const Feedback: Model<IFeedback> =
  (mongoose.models.Feedback as Model<IFeedback>) ||
  mongoose.model<IFeedback>("Feedback", FeedbackSchema);

export default Feedback;
