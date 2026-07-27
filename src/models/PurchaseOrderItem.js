import mongoose from "mongoose";

const PurchaseOrderItemSchema = new mongoose.Schema(
  {
    /* =========================================================
       RELATION
    ========================================================= */

    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      required: true,
      index: true,
    },

    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    /* =========================================================
       MATERIAL
    ========================================================= */

    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Material",
      required: true,
      index: true,
    },

    materialCode: {
      type: String,
      trim: true,
      default: "",
    },

    materialName: {
      type: String,
      trim: true,
      default: "",
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    vendorMaterialCode: {
      type: String,
      trim: true,
      default: "",
    },

    barcode: {
      type: String,
      trim: true,
      default: "",
    },

    hsnCode: {
      type: String,
      default: "",
    },

    /* =========================================================
       QUANTITY
    ========================================================= */

    orderedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    receivedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    acceptedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    rejectedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    pendingQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    unit: {
      type: String,
      required: true,
      trim: true,
    },

    /* =========================================================
       COMMERCIAL
    ========================================================= */

    currency: {
      type: String,
      default: "INR",
      uppercase: true,
    },

    unitPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    taxPercent: {
      type: Number,
      default: 0,
      min: 0,
    },

    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lineTotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    receivedValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* =========================================================
       DELIVERY
    ========================================================= */

    expectedDeliveryDate: Date,

    leadTimeDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastReceiptDate: Date,

    grnCompleted: {
      type: Boolean,
      default: false,
    },

    /* =========================================================
       INVENTORY / TRACEABILITY
    ========================================================= */

    batchRequired: {
      type: Boolean,
      default: false,
    },

    expiryRequired: {
      type: Boolean,
      default: false,
    },

    manufacturingDateRequired: {
      type: Boolean,
      default: false,
    },

    serialTracking: {
      type: Boolean,
      default: false,
    },

    /* =========================================================
       QUALITY
    ========================================================= */

    qcRequired: {
      type: Boolean,
      default: false,
    },

    qcStatus: {
      type: String,
      enum: [
        "PENDING",
        "PASSED",
        "FAILED",
      ],
      default: "PENDING",
    },

    /* =========================================================
       REMARKS
    ========================================================= */

    remarks: {
      type: String,
      default: "",
      trim: true,
    },

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

PurchaseOrderItemSchema.index({
  purchaseOrderId: 1,
  materialId: 1,
});

PurchaseOrderItemSchema.index({
  materialId: 1,
});

PurchaseOrderItemSchema.index({
  businessId: 1,
  materialId: 1,
});

PurchaseOrderItemSchema.index({
  businessId: 1,
  barcode: 1,
});

PurchaseOrderItemSchema.index({
  businessId: 1,
  qcStatus: 1,
});

PurchaseOrderItemSchema.index({
  businessId: 1,
  grnCompleted: 1,
});

export default
  mongoose.models.PurchaseOrderItem ||
  mongoose.model(
    "PurchaseOrderItem",
    PurchaseOrderItemSchema
  );
