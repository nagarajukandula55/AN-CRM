/**
 * Review — Native storefront product reviews (see ANGROUP_INTEGRATION_STATUS.md
 * in the Native repo: "/api/reviews* — Not found anywhere in ANgroup").
 *
 * Scoped by productId + businessId, same multi-tenant pattern as
 * NativeProduct. Includes a moderation status because this sits inside an
 * ERP admin context (not a pure consumer app) — reviews default to PENDING
 * and only APPROVED ones are ever returned by the public list route.
 */

import mongoose, { Schema, Model, Document } from "mongoose";

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface IReview extends Document {
  productId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  reviewerName: string;
  reviewerEmail?: string;
  rating: number;
  title?: string;
  comment?: string;
  status: ReviewStatus;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "NativeProduct", required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewerName: { type: String, required: true, trim: true },
    reviewerEmail: { type: String, trim: true, lowercase: true, default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, default: "" },
    comment: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ReviewSchema.index({ productId: 1, businessId: 1, status: 1 });

const Review: Model<IReview> =
  (mongoose.models.Review as Model<IReview>) || mongoose.model<IReview>("Review", ReviewSchema);

export default Review;
