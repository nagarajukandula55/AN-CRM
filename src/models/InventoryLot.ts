import mongoose, { Schema, Model, Document } from "mongoose";

export interface IInventoryLot extends Document {
  businessId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  lotNumber: string;
  batchNumber?: string;
  quantity: number;
  remainingQuantity: number;
  unitCost: number;
  totalCost: number;
  manufacturedDate?: Date;
  expiryDate?: Date;
  receivedDate: Date;
  supplierId?: mongoose.Types.ObjectId;
  grnId?: mongoose.Types.ObjectId;
  status: "ACTIVE" | "EXHAUSTED" | "EXPIRED" | "QUARANTINE";
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryLotSchema = new Schema<IInventoryLot>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    itemId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Inventory",
      index: true,
    },
    lotNumber: { type: String, required: true },
    batchNumber: { type: String },
    quantity: { type: Number, required: true, min: 0 },
    remainingQuantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, default: 0 },
    totalCost: { type: Number, required: true, default: 0 },
    manufacturedDate: { type: Date },
    expiryDate: { type: Date },
    receivedDate: { type: Date, default: Date.now },
    supplierId: { type: Schema.Types.ObjectId, ref: "VendorProfile" },
    grnId: { type: Schema.Types.ObjectId },
    status: {
      type: String,
      enum: ["ACTIVE", "EXHAUSTED", "EXPIRED", "QUARANTINE"],
      default: "ACTIVE",
    },
    notes: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

// Compound index for uniqueness per business + lot number
InventoryLotSchema.index({ businessId: 1, lotNumber: 1 }, { unique: true });

const InventoryLot: Model<IInventoryLot> =
  (mongoose.models.InventoryLot as Model<IInventoryLot>) ||
  mongoose.model<IInventoryLot>("InventoryLot", InventoryLotSchema);

export default InventoryLot;
