import mongoose, { Schema, Document, Model } from "mongoose";
import { BUSINESS_SCOPES, type BusinessScope } from "@/core/catalog/businessScope";

export interface IProductCategory extends Document {
  businessId: mongoose.Types.ObjectId;
  businessScope: BusinessScope;
  businessIds: mongoose.Types.ObjectId[];
  name: string;
  description?: string;
  parentId?: mongoose.Types.ObjectId | null;
  imageUrl?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProductCategorySchema = new Schema<IProductCategory>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    businessScope: { type: String, enum: BUSINESS_SCOPES, default: "SINGLE" },
    businessIds: [{ type: Schema.Types.ObjectId, ref: "Business" }],
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "ProductCategory", default: null },
    imageUrl: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

ProductCategorySchema.index({ businessId: 1, name: 1 });
ProductCategorySchema.index({ businessId: 1, isDeleted: 1 });

const ProductCategory: Model<IProductCategory> =
  mongoose.models.ProductCategory ||
  mongoose.model<IProductCategory>("ProductCategory", ProductCategorySchema);

export default ProductCategory;
