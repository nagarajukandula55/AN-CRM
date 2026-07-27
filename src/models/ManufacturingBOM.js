/**
 * Manufacturing production BOM (multi-level, cost-rollup) -- renamed from
 * the plain "BOM" model name to "ManufacturingBOM" so that name is free
 * for the canonical Material/BOM model every operating mode (Brand/SC/
 * POS/Sales) shares -- see models/BOM.ts (formerly ServiceCenterBOM.ts).
 * Explicit `collection: "boms"` keeps this pinned to its original
 * collection so existing manufacturing BOM data is untouched by the
 * rename -- only the JS-level model registration name changed, not the
 * physical data. AN-CRM doesn't surface manufacturing/production in its
 * nav (that stays in ANgroup) but this model is kept as-is for any
 * remaining direct callers.
 */
import mongoose from "mongoose";

const BOMItemSchema = new mongoose.Schema(
  {
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Material",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    unit: {
      type: String,
      required: true,
    },

    wastagePercent: {
      type: Number,
      default: 0,
    },

    currentCost: {
      type: Number,
      default: 0,
    },

    safeCost: {
      type: Number,
      default: 0,
    },

    worstCaseCost: {
      type: Number,
      default: 0,
    },

    remarks: String,
  },
  {
    _id: false,
  }
);

const BOMSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
    },

    productVariantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },

    versionNumber: {
      type: Number,
      default: 1,
    },

    batchSize: {
      type: Number,
      default: 1,
    },

    yieldPercent: {
      type: Number,
      default: 100,
    },

    items: [BOMItemSchema],

    totalCurrentCost: {
      type: Number,
      default: 0,
    },

    totalSafeCost: {
      type: Number,
      default: 0,
    },

    totalWorstCaseCost: {
      type: Number,
      default: 0,
    },

    notes: String,

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "boms",
  }
);

BOMSchema.index({
  productVariantId: 1,
  versionNumber: 1,
});

export default mongoose.models.ManufacturingBOM ||
  mongoose.model("ManufacturingBOM", BOMSchema);
