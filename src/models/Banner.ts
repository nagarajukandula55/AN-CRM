import mongoose, { Schema, Document, Model } from "mongoose";

// Homepage hero-slideshow banner for a storefront tenant (Native, etc).
// Previously these images were static files the project owner had to
// manually drop into a folder on the frontend -- this model + the
// admin/banners CRUD routes + public storefront/banners route replace
// that with a real upload UI (see src/app/admin/business/[id]/banners
// and src/app/api/storefront/banners/route.ts).
export interface IBanner extends Document {
  businessId: mongoose.Types.ObjectId;
  imageUrl: string;
  heading?: string;
  subheading?: string;
  ctaText?: string;
  ctaLink?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BannerSchema = new Schema<IBanner>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    imageUrl: { type: String, required: true, trim: true },
    heading: { type: String, trim: true },
    subheading: { type: String, trim: true },
    ctaText: { type: String, trim: true, default: "SHOP NOW" },
    ctaLink: { type: String, trim: true, default: "/products" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

BannerSchema.index({ businessId: 1, isActive: 1, sortOrder: 1 });

const Banner: Model<IBanner> =
  mongoose.models.Banner || mongoose.model<IBanner>("Banner", BannerSchema);

export default Banner;
