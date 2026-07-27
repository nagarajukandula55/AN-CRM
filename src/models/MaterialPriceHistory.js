import mongoose from "mongoose";

const MaterialPriceHistorySchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      index: true,
    },

    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Material",
      required: true,
      index: true,
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
      index: true,
    },

    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
      index: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    // No enum -- the app's real material units go beyond commodity
    // measures (pcs, pack, box, dozen alongside kg/g/l/ml), so this stores
    // whatever unit the price was actually quoted in rather than forcing a
    // lossy remap onto a fixed weight/volume list.
    priceUnit: {
      type: String,
      default: "KG",
    },

    currency: {
      type: String,
      default: "INR",
    },

    effectiveDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    source: {
      type: String,
      enum: ["MANUAL", "PURCHASE_ORDER", "GOODS_RECEIPT", "IMPORT", "SYSTEM"],
      default: "MANUAL",
    },

    sourceReferenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    sourceReferenceType: {
      type: String,
      enum: ["PURCHASE_ORDER", "GOODS_RECEIPT", "MANUAL", "IMPORT"],
      default: null,
    },

    approved: {
      type: Boolean,
      default: false,
      index: true,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    remarks: {
      type: String,
      default: "",
    },

    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

/* =========================================================
INDEXES (OPTIMIZED FOR REAL QUERIES)
========================================================= */

/* Fast history fetch */
MaterialPriceHistorySchema.index({
  materialId: 1,
  effectiveDate: -1,
});

/* Vendor-based pricing */
MaterialPriceHistorySchema.index({
  materialId: 1,
  vendorId: 1,
  effectiveDate: -1,
});

/* Warehouse-based pricing */
MaterialPriceHistorySchema.index({
  materialId: 1,
  warehouseId: 1,
  effectiveDate: -1,
});

/* Multi-tenant + trending queries */
MaterialPriceHistorySchema.index({
  businessId: 1,
  materialId: 1,
  effectiveDate: -1,
});

/* Latest active price lookup */
MaterialPriceHistorySchema.index({
  materialId: 1,
  active: 1,
  effectiveDate: -1,
});

/* 🚨 Prevent duplicate price entries (VERY IMPORTANT) */
MaterialPriceHistorySchema.index(
  {
    materialId: 1,
    vendorId: 1,
    warehouseId: 1,
    effectiveDate: 1,
  },
  { unique: true }
);

/* =========================================================
MODEL EXPORT (Next.js safe hot-reload)
========================================================= */
export default mongoose.models.MaterialPriceHistory ||
  mongoose.model("MaterialPriceHistory", MaterialPriceHistorySchema);
