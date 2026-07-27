/**
 * NewsletterSubscriber — Native storefront email capture (see
 * ANGROUP_INTEGRATION_STATUS.md in the Native repo:
 * "POST /api/newsletter/subscribe — Not found").
 */

import mongoose, { Schema, Model, Document } from "mongoose";

export interface INewsletterSubscriber extends Document {
  email: string;
  businessId: mongoose.Types.ObjectId;
  isActive: boolean;
  unsubscribedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NewsletterSubscriberSchema = new Schema<INewsletterSubscriber>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    isActive: { type: Boolean, default: true },
    unsubscribedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

NewsletterSubscriberSchema.index({ email: 1, businessId: 1 }, { unique: true });

const NewsletterSubscriber: Model<INewsletterSubscriber> =
  (mongoose.models.NewsletterSubscriber as Model<INewsletterSubscriber>) ||
  mongoose.model<INewsletterSubscriber>("NewsletterSubscriber", NewsletterSubscriberSchema);

export default NewsletterSubscriber;
