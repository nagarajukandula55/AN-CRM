import mongoose, { Schema, Model, Document } from "mongoose";

export interface IStockTransferItem {
  itemId: mongoose.Types.ObjectId;
  itemName: string;
  sku?: string;
  quantity: number;
  unit: string;
  unitCost?: number;
}

export interface IStockTransfer extends Document {
  transferNumber: string;
  businessId: mongoose.Types.ObjectId;
  fromWarehouse: string;
  toWarehouse: string;
  items: IStockTransferItem[];
  status: "DRAFT" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  notes?: string;
  requestedBy?: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  transferredAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StockTransferItemSchema = new Schema<IStockTransferItem>(
  {
    itemId: { type: Schema.Types.ObjectId, required: true },
    itemName: { type: String, required: true },
    sku: { type: String },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "pcs" },
    unitCost: { type: Number, default: 0 },
  },
  { _id: false }
);

const StockTransferSchema = new Schema<IStockTransfer>(
  {
    transferNumber: { type: String },
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    fromWarehouse: { type: String, required: true },
    toWarehouse: { type: String, required: true },
    items: { type: [StockTransferItemSchema], default: [] },
    status: {
      type: String,
      enum: ["DRAFT", "IN_TRANSIT", "COMPLETED", "CANCELLED"],
      default: "DRAFT",
    },
    notes: { type: String },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    transferredAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

// transferNumber was GLOBALLY unique -- same cross-business collision risk
// as PurchaseOrder.poNumber: scoped per-business instead.
StockTransferSchema.index({ businessId: 1, transferNumber: 1 }, { unique: true });

const StockTransfer: Model<IStockTransfer> =
  (mongoose.models.StockTransfer as Model<IStockTransfer>) ||
  mongoose.model<IStockTransfer>("StockTransfer", StockTransferSchema);

export default StockTransfer;
