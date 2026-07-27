import mongoose from "mongoose";

const InventorySchema = new mongoose.Schema(
  {
    /* =========================================================
       BUSINESS / LOCATION
    ========================================================= */

    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
      index: true,
    },

    /* =========================================================
       INVENTORY TYPE
    ========================================================= */

    itemType: {
      type: String,
      enum: ["MATERIAL", "PRODUCT_VARIANT"],
      required: true,
      index: true,
    },

    /* =========================================================
       ITEM REFERENCES
    ========================================================= */

    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Material",
      default: null,
    },

    productVariantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant",
      default: null,
    },

    /* =========================================================
       SNAPSHOT DETAILS (FOR REPORTING)
    ========================================================= */

    itemCode: {
      type: String,
      trim: true,
    },

    itemName: {
      type: String,
      trim: true,
    },

    sku: {
      type: String,
      trim: true,
    },

    unit: {
      type: String,
      required: true,
      trim: true,
    },

    /* =========================================================
       STOCK SUMMARY
       (Current Inventory Snapshot)
    ========================================================= */

    onHandQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    reservedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    availableQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    damagedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    blockedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* =========================================================
       COSTING
    ========================================================= */

    averageCost: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* =========================================================
       REORDER SETTINGS
    ========================================================= */

    reorderLevel: {
      type: Number,
      default: 0,
      min: 0,
    },

    reorderQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* =========================================================
       FUTURE SUPPORT
    ========================================================= */

    batchTracking: {
      type: Boolean,
      default: false,
    },

    expiryTracking: {
      type: Boolean,
      default: false,
    },

    /* =========================================================
       LAST MOVEMENT
    ========================================================= */

    lastTransactionDate: Date,

    lastTransactionType: {
      type: String,
      enum: [
        "OPENING",
        "PURCHASE",
        "GRN",
        "SALE",
        "RETURN",
        "TRANSFER_IN",
        "TRANSFER_OUT",
        "MANUFACTURING",
        "ADJUSTMENT",
        "RESERVATION",
        "RESERVATION_RELEASE",
      ],
    },

    /* =========================================================
       STATUS
    ========================================================= */

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================================================
   INDEXES
========================================================= */

// Material Inventory
InventorySchema.index({
  warehouseId: 1,
  materialId: 1,
});

// Product Variant Inventory
InventorySchema.index({
  warehouseId: 1,
  productVariantId: 1,
});

// Fast warehouse reports
InventorySchema.index({
  warehouseId: 1,
  itemType: 1,
});

// Business-wise inventory
InventorySchema.index({
  businessId: 1,
  warehouseId: 1,
});

// Fast SKU lookup
InventorySchema.index({
  sku: 1,
});

// Prevent duplicate inventory records
InventorySchema.index(
  {
    warehouseId: 1,
    materialId: 1,
    productVariantId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      active: true,
    },
  }
);

export default mongoose.models.Inventory ||
  mongoose.model("Inventory", InventorySchema);
