import mongoose, { Schema, Model, Document } from "mongoose";

export interface IProductionOrder extends Document {
  orderNumber: string;
  businessId: mongoose.Types.ObjectId;
  bomId?: mongoose.Types.ObjectId;
  productName: string;
  productSku?: string;
  plannedQuantity: number;
  producedQuantity: number;
  unit: string;
  status: "DRAFT" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  notes?: string;
  createdBy: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductionOrderSchema = new Schema<IProductionOrder>(
  {
    orderNumber: { type: String },
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    bomId: { type: Schema.Types.ObjectId, ref: "BOM" },
    productName: { type: String, required: true },
    productSku: { type: String },
    plannedQuantity: { type: Number, required: true, min: 1 },
    producedQuantity: { type: Number, default: 0 },
    unit: { type: String, default: "pcs" },
    status: {
      type: String,
      enum: ["DRAFT", "PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "DRAFT",
    },
    priority: {
      type: String,
      enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
      default: "NORMAL",
    },
    plannedStartDate: { type: Date },
    plannedEndDate: { type: Date },
    actualStartDate: { type: Date },
    actualEndDate: { type: Date },
    notes: { type: String },
    createdBy: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// orderNumber was GLOBALLY unique -- same cross-business collision risk as
// PurchaseOrder.poNumber: scoped per-business instead.
ProductionOrderSchema.index({ businessId: 1, orderNumber: 1 }, { unique: true });

const ProductionOrder: Model<IProductionOrder> =
  (mongoose.models.ProductionOrder as Model<IProductionOrder>) ||
  mongoose.model<IProductionOrder>("ProductionOrder", ProductionOrderSchema);

export default ProductionOrder;
