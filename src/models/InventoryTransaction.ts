import mongoose from "mongoose";

const InventoryTransactionSchema = new mongoose.Schema(
  {
    /* =========================================================
       BUSINESS
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
       ITEM
    ========================================================= */

    itemType: {
      type: String,
      enum: ["MATERIAL", "PRODUCT_VARIANT"],
      required: true,
      index: true,
    },

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

    itemCode: String,
    itemName: String,
    sku: String,
    unit: String,

    /* =========================================================
       TRANSACTION
    ========================================================= */

    transactionType: {
      type: String,
      enum: [
        "OPENING",
        "PURCHASE",
        "GRN",
        "SALE",
        "RETURN",
        "TRANSFER_IN",
        "TRANSFER_OUT",
        "MANUFACTURING_IN",
        "MANUFACTURING_OUT",
        "ADJUSTMENT",
        "RESERVATION",
        "RESERVATION_RELEASE",
      ],
      required: true,
      index: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    runningQuantity: {
        type:Number,
        default:0
    },

    runningValue: {
        type:Number,
        default:0
    },

    unitCost: {
      type: Number,
      default: 0,
    },

    totalCost: {
      type: Number,
      default: 0,
    },

    movementReason: {
        type:String,
        enum:[
            "PURCHASE",
            "CUSTOMER_ORDER",
            "MANUFACTURING",
            "TRANSFER",
            "RETURN",
            "ADJUSTMENT",
            "DAMAGE",
            "EXPIRED",
            "SYSTEM"
        ]
    },

    /* =========================================================
       DOCUMENT REFERENCE
    ========================================================= */

    referenceType: {
      type: String,
      enum: [
        "PURCHASE_ORDER",
        "GOODS_RECEIPT",
        "SALES_ORDER",
        "RETURN",
        "TRANSFER",
        "MANUFACTURING",
        "ADJUSTMENT",
        "SYSTEM",
      ],
      default: "SYSTEM",
    },

    referenceId: mongoose.Schema.Types.ObjectId,

    referenceNumber: String,

    remarks: String,

    /* =========================================================
       AUDIT
    ========================================================= */

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

InventoryTransactionSchema.index({
  warehouseId: 1,
  transactionType: 1,
});

InventoryTransactionSchema.index({
  materialId: 1,
});

InventoryTransactionSchema.index({
  productVariantId: 1,
});

InventoryTransactionSchema.index({
  referenceType: 1,
  referenceId: 1,
});

export default
  mongoose.models.InventoryTransaction ||
  mongoose.model(
    "InventoryTransaction",
    InventoryTransactionSchema
  );
