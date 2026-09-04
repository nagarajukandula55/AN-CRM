/**
 * Company-issued discount codes -- distinct from the vendor referral
 * system (VendorProfile.referredByCode / VendorSubscription.
 * pendingReferralDiscountPct): a referral code always belongs to one
 * vendor and rewards them for bringing someone in; a PromoCode belongs to
 * AN Group itself, created by a Super Admin, and can be handed out for
 * any reason (a festival offer, a partnership deal, a one-off goodwill
 * gesture) without needing a vendor in the loop at all. Per explicit
 * direction ("have another one also system like refer only but that is
 * from our company side so if we want to give any special discounts of
 * offers we can always use that").
 */
import mongoose, { Schema, Model, Document } from "mongoose";

export interface IPromoCode extends Document {
  code: string;
  description?: string;
  discountPct: number;
  // Optional cap on how many times this code can ever be redeemed --
  // unset/0 means unlimited.
  maxRedemptions?: number;
  redeemedCount: number;
  expiresAt?: Date;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PromoCodeSchema = new Schema<IPromoCode>(
  {
    code: { type: String, required: true, uppercase: true, trim: true, unique: true },
    description: { type: String, trim: true },
    discountPct: { type: Number, required: true, min: 1, max: 100 },
    maxRedemptions: { type: Number },
    redeemedCount: { type: Number, default: 0 },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const PromoCode: Model<IPromoCode> =
  (mongoose.models.PromoCode as Model<IPromoCode>) ||
  mongoose.model<IPromoCode>("PromoCode", PromoCodeSchema);

export default PromoCode;
