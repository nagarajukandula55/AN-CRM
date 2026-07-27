import mongoose, { Schema, Model, Document } from "mongoose";

export interface IProductionBatch extends Document {
  batchNumber: string;
  productionOrderId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  status: "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED";
  startedAt: Date;
  completedAt?: Date;
  plannedQuantity: number;
  producedQuantity: number;
  rejectedQuantity: number;
  unit: string;
  operatorId?: string;
  operatorName?: string;
  machineId?: string;
  machineName?: string;
  qualityChecked: boolean;
  qualityNotes?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProductionBatchSchema = new Schema<IProductionBatch>(
  {
    batchNumber: { type: String },
    productionOrderId: {
      type: Schema.Types.ObjectId,
      ref: "ProductionOrder",
      required: true,
      index: true,
    },
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: {
      type: String,
      enum: ["RUNNING", "PAUSED", "COMPLETED", "FAILED"],
      default: "RUNNING",
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    plannedQuantity: { type: Number, required: true },
    producedQuantity: { type: Number, default: 0 },
    rejectedQuantity: { type: Number, default: 0 },
    unit: { type: String, default: "pcs" },
    operatorId: { type: String },
    operatorName: { type: String },
    machineId: { type: String },
    machineName: { type: String },
    qualityChecked: { type: Boolean, default: false },
    qualityNotes: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

// batchNumber was GLOBALLY unique -- same cross-business collision risk as
// PurchaseOrder.poNumber: scoped per-business instead.
ProductionBatchSchema.index({ businessId: 1, batchNumber: 1 }, { unique: true });

const ProductionBatch: Model<IProductionBatch> =
  (mongoose.models.ProductionBatch as Model<IProductionBatch>) ||
  mongoose.model<IProductionBatch>("ProductionBatch", ProductionBatchSchema);

export default ProductionBatch;
