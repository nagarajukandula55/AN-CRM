import mongoose, { Schema, Model, Document } from "mongoose";

export interface IProductionOrderItem extends Document {
  productionOrderId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  materialId?: mongoose.Types.ObjectId;
  materialName: string;
  materialSku?: string;
  requiredQuantity: number;
  consumedQuantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProductionOrderItemSchema = new Schema<IProductionOrderItem>(
  {
    productionOrderId: {
      type: Schema.Types.ObjectId,
      ref: "ProductionOrder",
      required: true,
      index: true,
    },
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    materialId: { type: Schema.Types.ObjectId },
    materialName: { type: String, required: true },
    materialSku: { type: String },
    requiredQuantity: { type: Number, required: true, min: 0 },
    consumedQuantity: { type: Number, default: 0 },
    unit: { type: String, default: "pcs" },
    unitCost: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    notes: { type: String },
  },
  { timestamps: true }
);

const ProductionOrderItem: Model<IProductionOrderItem> =
  (mongoose.models.ProductionOrderItem as Model<IProductionOrderItem>) ||
  mongoose.model<IProductionOrderItem>(
    "ProductionOrderItem",
    ProductionOrderItemSchema
  );

export default ProductionOrderItem;
