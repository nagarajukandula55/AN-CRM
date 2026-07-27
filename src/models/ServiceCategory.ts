/**
 * ServiceCategory — the multi-vertical booking catalog for the ServiceFlow
 * marketplace app (working name). Generic on purpose: `key`/`services`
 * are data, not code, so a new vertical (salon, spa, vehicle care) is a
 * seed-data addition, not a schema change. A category exists platform-wide
 * but only appears to a customer if it's also in that customer's resolved
 * Region.enabledCategoryKeys — the category's own `enabled` flag is the
 * platform-wide master switch, the region list is the per-state switch.
 */
import mongoose, { Schema, Model, Document } from "mongoose";

export interface IServiceCategoryService {
  key: string;
  name: string;
  description?: string;
  iconAssetUrl?: string;
  estimatedDurationMinutes?: number;
}

export interface IServiceCategory extends Document {
  key: string; // lowercase_snake_case, e.g. "appliance_repair"
  name: string;
  description?: string;
  iconAssetUrl?: string;
  enabled: boolean; // platform-wide master switch
  sortOrder: number;
  services: IServiceCategoryService[];
  createdAt: Date;
  updatedAt: Date;
}

const ServiceSchema = new Schema<IServiceCategoryService>(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    iconAssetUrl: { type: String },
    estimatedDurationMinutes: { type: Number },
  },
  { _id: false }
);

const ServiceCategorySchema = new Schema<IServiceCategory>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    iconAssetUrl: { type: String },
    enabled: { type: Boolean, default: false, index: true },
    sortOrder: { type: Number, default: 0 },
    services: { type: [ServiceSchema], default: [] },
  },
  { timestamps: true }
);

const ServiceCategory: Model<IServiceCategory> =
  (mongoose.models.ServiceCategory as Model<IServiceCategory>) ||
  mongoose.model<IServiceCategory>("ServiceCategory", ServiceCategorySchema);

export default ServiceCategory;
