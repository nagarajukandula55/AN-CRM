import mongoose from "mongoose";

const QualityInspectionSchema =
  new mongoose.Schema(
    {
      companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
      },

      inspectionNumber: {
        type: String,
        required: true,
        unique: true,
      },

      goodsReceiptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GoodsReceipt",
      },

      inventoryLotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "InventoryLot",
      },

      materialId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Material",
      },

      inspectionDate: {
        type: Date,
        default: Date.now,
      },

      status: {
        type: String,
        enum: [
          "PENDING",
          "APPROVED",
          "REJECTED",
          "HOLD",
        ],
        default: "PENDING",
      },

      checkedQuantity: {
        type: Number,
        default: 0,
      },

      approvedQuantity: {
        type: Number,
        default: 0,
      },

      rejectedQuantity: {
        type: Number,
        default: 0,
      },

      remarks: String,

      inspectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    {
      timestamps: true,
    }
  );

export default mongoose.models.QualityInspection ||
  mongoose.model(
    "QualityInspection",
    QualityInspectionSchema
  );
