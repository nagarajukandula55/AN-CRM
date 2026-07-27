/**
 * Wishlist — Native storefront saved-products list (see
 * ANGROUP_INTEGRATION_STATUS.md in the Native repo:
 * "/api/wishlist* — Not found anywhere in ANgroup").
 *
 * One document per (userId, businessId) pair — unlike reviews/products,
 * this is NOT public: a wishlist is personal to a signed-in user, so the
 * routes stay behind the normal an_token auth middleware (x-user-id).
 */

import mongoose, { Schema, Model, Document } from "mongoose";

export interface IWishlist extends Document {
  userId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  productIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const WishlistSchema = new Schema<IWishlist>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    productIds: [{ type: Schema.Types.ObjectId, ref: "NativeProduct" }],
  },
  { timestamps: true }
);

WishlistSchema.index({ userId: 1, businessId: 1 }, { unique: true });

const Wishlist: Model<IWishlist> =
  (mongoose.models.Wishlist as Model<IWishlist>) || mongoose.model<IWishlist>("Wishlist", WishlistSchema);

export default Wishlist;
