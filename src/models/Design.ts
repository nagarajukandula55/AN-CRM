/**
 * Design — a saved Design Studio canvas. Both "my saved designs" and
 * shared "starter templates" live in this one collection, distinguished
 * by isTemplate: a private design (isTemplate:false) belongs to whoever
 * saved it; a template (isTemplate:true) shows up in the shared
 * Templates gallery as a read-only starting point — opening one always
 * goes through POST /api/design/designs/[id]/duplicate first, which
 * clones it with isTemplate:false, so the shared template itself is
 * never mutated by someone editing "their" copy.
 *
 * canvasJson stores the full Fabric.js `canvas.toJSON()` output verbatim
 * (Schema.Types.Mixed) — same "arbitrary serialized JSON payload" pattern
 * DocumentTemplate.ts already uses for its block configs, just at the
 * whole-canvas granularity instead of per-block.
 */
import mongoose, { Schema, Model, Document } from "mongoose";
import { BUSINESS_SCOPES, type BusinessScope } from "@/core/catalog/businessScope";

export interface IDesign extends Document {
  businessId: mongoose.Types.ObjectId;
  name: string;
  isTemplate: boolean;
  canvasWidth: number;
  canvasHeight: number;
  canvasJson: unknown;
  thumbnailAssetId?: mongoose.Types.ObjectId | null;
  createdBy?: mongoose.Types.ObjectId | null;
  businessScope: BusinessScope;
  businessIds: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DesignSchema = new Schema<IDesign>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    isTemplate: { type: Boolean, default: false },
    canvasWidth: { type: Number, required: true },
    canvasHeight: { type: Number, required: true },
    canvasJson: { type: Schema.Types.Mixed, required: true },
    thumbnailAssetId: { type: Schema.Types.ObjectId, ref: "Asset", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    businessScope: { type: String, enum: BUSINESS_SCOPES, default: "SINGLE" },
    businessIds: [{ type: Schema.Types.ObjectId, ref: "Business" }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DesignSchema.index({ businessId: 1, isTemplate: 1, isActive: 1 });

const Design: Model<IDesign> =
  (mongoose.models.Design as Model<IDesign>) ||
  mongoose.model<IDesign>("Design", DesignSchema);

export default Design;
