import mongoose, { Schema, Document, Model } from "mongoose";
import { BUSINESS_SCOPES, type BusinessScope } from "@/core/catalog/businessScope";

export interface IMaterialCategory extends Document {
  businessId: mongoose.Types.ObjectId;
  businessScope: BusinessScope;
  businessIds: mongoose.Types.ObjectId[];
  name: string;
  code?: string;
  description?: string;
  parentCategory?: mongoose.Types.ObjectId;
  unit?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MaterialCategorySchema = new Schema<IMaterialCategory>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    businessScope: { type: String, enum: BUSINESS_SCOPES, default: "SINGLE" },
    businessIds: [{ type: Schema.Types.ObjectId, ref: "Business" }],
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    description: { type: String, trim: true },
    parentCategory: { type: Schema.Types.ObjectId, ref: "MaterialCategory", default: null },
    unit: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

MaterialCategorySchema.index({ businessId: 1, name: 1 });
MaterialCategorySchema.index({ businessId: 1, isDeleted: 1 });

const MaterialCategory: Model<IMaterialCategory> =
  mongoose.models.MaterialCategory ||
  mongoose.model<IMaterialCategory>("MaterialCategory", MaterialCategorySchema);

export default MaterialCategory;
