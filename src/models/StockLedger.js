import mongoose from "mongoose";

const StockLedgerSchema = new mongoose.Schema(
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

    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      index: true,
    },

    type: {
      type: String,
      enum: ["IN", "OUT", "ADJUSTMENT"],
      required: true,
      index: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    referenceType: {
      type: String,
      enum: ["GRN", "SALES", "ADJUSTMENT", "RETURN"],
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    rate: {
      type: Number,
      default: 0,
    },

    remarks: String,

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

/* ================= INDEXES ================= */
StockLedgerSchema.index({
  materialId: 1,
  warehouseId: 1,
  createdAt: -1,
});

export default mongoose.models.StockLedger ||
  mongoose.model("StockLedger", StockLedgerSchema);
