import mongoose, { Schema, Model, Document } from "mongoose";

export type DiscountType = "PERCENTAGE" | "FIXED";
export type CouponStatus = "ACTIVE" | "INACTIVE" | "EXPIRED";

export interface ICoupon extends Document {
  businessId: mongoose.Types.ObjectId;
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number; // percent (0-100) or fixed INR amount
  minOrderValue?: number; // minimum cart value to apply
  maxDiscountAmount?: number; // cap for percentage discounts
  usageLimit?: number; // total redemptions allowed (undefined = unlimited)
  usageCount: number; // times redeemed so far
  perUserLimit?: number; // max uses per unique customer (undefined = unlimited)
  validFrom?: Date;
  validUntil?: Date;
  status: CouponStatus;
  applicableProducts?: mongoose.Types.ObjectId[]; // empty = all products
  applicableCategories?: string[]; // empty = all categories
  applicableBrands?: mongoose.Types.ObjectId[]; // empty = all brands, ref Brand
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true, ref: "Business" },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String },
    discountType: {
      type: String,
      enum: ["PERCENTAGE", "FIXED"],
      required: true,
    },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0 },
    maxDiscountAmount: { type: Number }, // only meaningful for PERCENTAGE
    usageLimit: { type: Number }, // undefined = unlimited
    usageCount: { type: Number, default: 0 },
    perUserLimit: { type: Number }, // undefined = unlimited
    validFrom: { type: Date },
    validUntil: { type: Date },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "EXPIRED"],
      default: "ACTIVE",
    },
    applicableProducts: [{ type: Schema.Types.ObjectId, ref: "NativeProduct" }],
    applicableCategories: [{ type: String }],
    applicableBrands: [{ type: Schema.Types.ObjectId, ref: "Brand" }],
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  },
  { timestamps: true }
);

// Unique code per business
CouponSchema.index({ businessId: 1, code: 1 }, { unique: true });
CouponSchema.index({ businessId: 1, status: 1 });
CouponSchema.index({ validUntil: 1 }, { sparse: true });

const Coupon: Model<ICoupon> =
  (mongoose.models.Coupon as Model<ICoupon>) ||
  mongoose.model<ICoupon>("Coupon", CouponSchema);

export default Coupon;
