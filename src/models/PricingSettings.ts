/**
 * Singleton: the one thing about pricing that isn't per-plan -- WHEN
 * founding/launch pricing ends and standard pricing takes over
 * (core/pricing/plans.ts's LAUNCH_PRICING_CUTOVER is the static compiled
 * default; a doc here overrides it). Lets Super Admin move that date at
 * runtime (e.g. extend the founding period) without a code deploy, same
 * override-or-fallback pattern PlanFeatureConfig already uses for
 * per-plan prices. Exactly one document ever exists (singleton id
 * "global"), upserted in place.
 */
import mongoose, { Schema, Model, Document } from "mongoose";

export interface IPricingSettings extends Omit<Document, "_id"> {
  _id: string;
  launchCutover?: Date;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const PricingSettingsSchema = new Schema<IPricingSettings>(
  {
    _id: { type: String, default: "global" },
    launchCutover: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const PricingSettings: Model<IPricingSettings> =
  (mongoose.models.PricingSettings as Model<IPricingSettings>) ||
  mongoose.model<IPricingSettings>("PricingSettings", PricingSettingsSchema);

export default PricingSettings;
