import mongoose, { Schema, Model, Document } from "mongoose";
import { BUSINESS_SCOPES, type BusinessScope } from "@/core/catalog/businessScope";

/**
 * Variant master data for a DeviceModel (e.g. "8GB RAM + 128GB Storage,
 * Awesome Navy"). Sits below DeviceModel in the catalog tree:
 * Category -> Brand -> Series -> DeviceModel -> Variant. Optional the same
 * way Series is optional -- a model can have zero variants (meaning the
 * model name itself is precise enough) or several.
 */
export interface IVariant extends Document {
  name: string;
  modelId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  businessScope: BusinessScope;
  businessIds: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VariantSchema = new Schema<IVariant>(
  {
    name: { type: String, required: true, trim: true },
    modelId: { type: Schema.Types.ObjectId, ref: "DeviceModel", required: true },
    businessId: { type: Schema.Types.ObjectId, required: true },
    businessScope: { type: String, enum: BUSINESS_SCOPES, default: "SINGLE" },
    businessIds: [{ type: Schema.Types.ObjectId, ref: "Business" }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

VariantSchema.index({ businessId: 1, modelId: 1, isActive: 1 });
VariantSchema.index({ businessId: 1, modelId: 1, name: 1 }, { unique: true });

const Variant: Model<IVariant> =
  (mongoose.models.Variant as Model<IVariant>) ||
  mongoose.model<IVariant>("Variant", VariantSchema);

export default Variant;
