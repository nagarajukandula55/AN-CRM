/**
 * Super-Admin-editable override of a Plan's moduleKeys (see
 * core/pricing/plans.ts's Plan.moduleKeys field comment). One row per
 * (mode, plan) that a Super Admin has actually edited via
 * /console/admin/plan-features -- absence of a row means "use the static
 * default from plans.ts", so most mode/plan combos never need a row at
 * all. Read by core/pricing/planAccess.ts, which every module-visibility
 * check (api/ui/sidebar, the Telegram business report) goes through.
 */
import mongoose, { Schema, Model, Document } from "mongoose";
import type { OperatingMode, PlanKey } from "@/core/pricing/plans";

export interface IPlanFeatureConfig extends Document {
  mode: OperatingMode;
  plan: PlanKey;
  moduleKeys: string[];
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PlanFeatureConfigSchema = new Schema<IPlanFeatureConfig>(
  {
    mode: { type: String, enum: ["BRAND", "SC", "POS"], required: true },
    plan: { type: String, enum: ["BASIC", "PRO", "ULTIMATE"], required: true },
    moduleKeys: { type: [String], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

PlanFeatureConfigSchema.index({ mode: 1, plan: 1 }, { unique: true });

const PlanFeatureConfig: Model<IPlanFeatureConfig> =
  (mongoose.models.PlanFeatureConfig as Model<IPlanFeatureConfig>) ||
  mongoose.model<IPlanFeatureConfig>("PlanFeatureConfig", PlanFeatureConfigSchema);

export default PlanFeatureConfig;
