/**
 * Region — one document per Indian state/UT, the enable/disable switchboard
 * for the ServiceFlow marketplace app (working name, expected to be
 * rebranded before public launch). Seeded once from the existing
 * `STATE_CODES` (src/core/gst/stateCodes.ts) so the GST 2-digit code stays
 * the single source of truth for state identity — this model adds
 * marketplace-only fields on top, it does not re-derive the state list.
 *
 * All states seed with enabled: false except the launch pilot; cities
 * carry their own enabled flag so a state can go live city-by-city.
 */
import mongoose, { Schema, Model, Document } from "mongoose";
import { syncRecordToCentralApi, deleteRecordFromCentralApi } from "@/lib/centralApiSync";

export interface IRegionCity {
  name: string;
  enabled: boolean;
}

export interface IRegion extends Document {
  stateCode: string; // FK to STATE_CODES, e.g. "37" for Andhra Pradesh
  stateName: string;
  enabled: boolean;
  cities: IRegionCity[];
  enabledCategoryKeys: string[]; // ServiceCategory.key values live in this state
  pricingMultiplier: number;
  locale: string; // e.g. "te-IN"
  themeKey: string; // FK to RegionTheme.key
  featureFlags: Record<string, boolean>;
  createdAt: Date;
  updatedAt: Date;
}

const RegionCitySchema = new Schema<IRegionCity>(
  {
    name: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: false },
  },
  { _id: false }
);

const RegionSchema = new Schema<IRegion>(
  {
    stateCode: { type: String, required: true, unique: true, trim: true },
    stateName: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: false, index: true },
    cities: { type: [RegionCitySchema], default: [] },
    enabledCategoryKeys: { type: [String], default: [] },
    pricingMultiplier: { type: Number, default: 1 },
    locale: { type: String, default: "en-IN" },
    themeKey: { type: String, default: "default" },
    featureFlags: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

RegionSchema.post("save", async function (doc) {
  await syncRecordToCentralApi("regions", doc._id.toString(), doc.toObject());
});
RegionSchema.post("findOneAndUpdate", async function (doc) {
  if (doc) await syncRecordToCentralApi("regions", doc._id.toString(), doc.toObject ? doc.toObject() : doc);
});
RegionSchema.post("findOneAndDelete", async function (doc) {
  if (doc) await deleteRecordFromCentralApi("regions", doc._id.toString());
});

const Region: Model<IRegion> =
  (mongoose.models.Region as Model<IRegion>) || mongoose.model<IRegion>("Region", RegionSchema);

export default Region;
