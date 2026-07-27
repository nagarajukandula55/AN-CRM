import mongoose from "mongoose";

const StockTransferItemSchema =
  new mongoose.Schema(
    {
      stockTransferId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StockTransfer",
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

      quantity: {
        type: Number,
        required: true,
      },

      receivedQuantity: {
        type: Number,
        default: 0,
      },

      remarks: String,
    },
    {
      timestamps: true,
    }
  );

export default mongoose.models.StockTransferItem ||
  mongoose.model(
    "StockTransferItem",
    StockTransferItemSchema
  );
