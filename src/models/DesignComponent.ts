/**
 * DesignComponent — a named, reusable design piece (a logo, a manually
 * cropped label region, a text block, etc) that the Design Studio canvas
 * editor can drop onto any design. The actual pixel data always lives in
 * an Asset (Cloudinary-backed, via the existing /api/assets/upload
 * endpoint — see that route's own header comment) — this model is just
 * the "named, categorized, reusable" wrapper around one.
 *
 * sourceAssetId (optional) points back at the original full upload this
 * component was cropped FROM, purely for traceability in the "Split into
 * Components" tool (src/app/admin/design-studio/assets/page.tsx) — it is
 * never required, since a component can also be created directly (e.g. a
 * plain logo upload with no cropping involved).
 */
import mongoose, { Schema, Model, Document } from "mongoose";

export type DesignComponentCategory =
  | "LOGO"
  | "LABEL_PIECE"
  | "TEXT_BLOCK"
  | "GRAPHIC"
  | "BARCODE"
  | "OTHER";

export const DESIGN_COMPONENT_CATEGORIES: DesignComponentCategory[] = [
  "LOGO",
  "LABEL_PIECE",
  "TEXT_BLOCK",
  "GRAPHIC",
  "BARCODE",
  "OTHER",
];

export interface IDesignComponent extends Document {
  businessId: mongoose.Types.ObjectId;
  name: string;
  category: DesignComponentCategory;
  assetId: mongoose.Types.ObjectId;
  sourceAssetId?: mongoose.Types.ObjectId | null;
  width?: number;
  height?: number;
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DesignComponentSchema = new Schema<IDesignComponent>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: DESIGN_COMPONENT_CATEGORIES, default: "OTHER" },
    assetId: { type: Schema.Types.ObjectId, ref: "Asset", required: true },
    sourceAssetId: { type: Schema.Types.ObjectId, ref: "Asset", default: null },
    width: { type: Number },
    height: { type: Number },
    tags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DesignComponentSchema.index({ businessId: 1, category: 1, isActive: 1 });

const DesignComponent: Model<IDesignComponent> =
  (mongoose.models.DesignComponent as Model<IDesignComponent>) ||
  mongoose.model<IDesignComponent>("DesignComponent", DesignComponentSchema);

export default DesignComponent;
