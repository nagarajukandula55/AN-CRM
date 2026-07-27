import mongoose, { Schema, Model, Document } from "mongoose";
import { BUSINESS_SCOPES, type BusinessScope } from "@/core/catalog/businessScope";

/**
 * Product-line master data for a Brand (e.g. Samsung -> "Galaxy S", "Galaxy A";
 * Apple -> "iPhone", "iPad", "MacBook"). Sits between Brand and DeviceModel in
 * the catalog tree: Brand -> Series -> DeviceModel. Every brand has at least
 * one Series (brands with no natural product line get a single "General"
 * series via scripts/migrateAddSeriesToModels.ts / scripts/seedDeviceCategories.ts)
 * so DeviceModel.seriesId can always be set, even though it stays optional at
 * the schema level for backward compatibility with pre-migration docs.
 */
export interface ISeries extends Document {
  name: string;
  brandId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  businessScope: BusinessScope;
  businessIds: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SeriesSchema = new Schema<ISeries>(
  {
    name: { type: String, required: true, trim: true },
    brandId: { type: Schema.Types.ObjectId, ref: "Brand", required: true },
    businessId: { type: Schema.Types.ObjectId, required: true },
    businessScope: { type: String, enum: BUSINESS_SCOPES, default: "SINGLE" },
    businessIds: [{ type: Schema.Types.ObjectId, ref: "Business" }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SeriesSchema.index({ businessId: 1, brandId: 1, isActive: 1 });
SeriesSchema.index({ businessId: 1, brandId: 1, name: 1 }, { unique: true });

const Series: Model<ISeries> =
  (mongoose.models.Series as Model<ISeries>) ||
  mongoose.model<ISeries>("Series", SeriesSchema);

export default Series;
