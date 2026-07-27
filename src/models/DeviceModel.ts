import mongoose, { Schema, Model, Document } from "mongoose";
import { BUSINESS_SCOPES, type BusinessScope } from "@/core/catalog/businessScope";

/**
 * Device model master data (e.g. "iPhone 13", "Galaxy S21"), scoped to a
 * parent Brand -- same business-tagging pattern as Brand/ProductCategory/
 * MaterialCategory. Lets CRM appointment/job sheet forms offer a real
 * dropdown for "Model" instead of a free-text box, while still allowing a
 * one-off typed value for a model that isn't in the list yet (see the
 * hybrid ModelInput component).
 */
export interface IDeviceModel extends Document {
  name: string;
  brandId: mongoose.Types.ObjectId;
  // Which Series (product line) under brandId this model belongs to.
  // Optional -- a brand with no meaningful product line can have models
  // attach directly to it with no Series at all.
  seriesId?: mongoose.Types.ObjectId | null;
  businessId: mongoose.Types.ObjectId;
  businessScope: BusinessScope;
  businessIds: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceModelSchema = new Schema<IDeviceModel>(
  {
    name: { type: String, required: true },
    brandId: { type: Schema.Types.ObjectId, ref: "Brand", required: true },
    seriesId: { type: Schema.Types.ObjectId, ref: "Series", default: null },
    businessId: { type: Schema.Types.ObjectId, required: true },
    businessScope: { type: String, enum: BUSINESS_SCOPES, default: "SINGLE" },
    businessIds: [{ type: Schema.Types.ObjectId, ref: "Business" }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DeviceModelSchema.index({ businessId: 1, brandId: 1, seriesId: 1, isActive: 1 });

DeviceModelSchema.index({ businessId: 1, brandId: 1, isActive: 1 });
DeviceModelSchema.index({ businessId: 1, brandId: 1, name: 1 }, { unique: true });

const DeviceModel: Model<IDeviceModel> =
  (mongoose.models.DeviceModel as Model<IDeviceModel>) ||
  mongoose.model<IDeviceModel>("DeviceModel", DeviceModelSchema);

export default DeviceModel;
