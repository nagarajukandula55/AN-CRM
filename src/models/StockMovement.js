import mongoose from "mongoose";

const StockMovementSchema =
  new mongoose.Schema(
    {
      companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
      },

      warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Warehouse",
        required: true,
      },

      itemType: {
        type: String,
        enum: [
          "MATERIAL",
          "PRODUCT_VARIANT",
        ],
        required: true,
      },

      materialId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Material",
      },

      productVariantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ProductVariant",
      },

      movementType: {
        type: String,
        enum: [
          "PURCHASE",
          "PRODUCTION",
          "SALE",
          "TRANSFER_IN",
          "TRANSFER_OUT",
          "ADJUSTMENT",
          "RETURN",
        ],
        required: true,
      },

      quantity: {
        type: Number,
        required: true,
      },

      balanceQuantity: {
        type: Number,
        default: 0,
      },

      unitCost: {
        type: Number,
        default: 0,
      },

      totalValue: {
        type: Number,
        default: 0,
      },

      referenceType: String,

      referenceId: {
        type: mongoose.Schema.Types.ObjectId,
      },

      remarks: String,
    },
    {
      timestamps: true,
    }
  );

StockMovementSchema.index({
  warehouseId: 1,
  createdAt: -1,
});

export default mongoose.models.StockMovement ||
  mongoose.model(
    "StockMovement",
    StockMovementSchema
  );
