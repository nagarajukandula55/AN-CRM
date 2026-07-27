import mongoose, { Schema, Model, Document } from "mongoose";

export type AdjustmentType = "ADD" | "REMOVE" | "SET";

export interface IStockAdjustment extends Document {
  businessId: mongoose.Types.ObjectId;
  /**
   * Human-facing, admin-configurable document number (e.g. "SA-2025-26-0001"),
   * generated via core/numbering/numberingService.ts's generateDocumentNumber()
   * with the "STOCK_ADJUSTMENT" document type — same engine as every other
   * document type. This field did not exist before ("ensure whatever
   * documents in the entire system that numbering should be controlled"
   * flagged this as a gap: adjustments were the one document type with no
   * number at all). Optional/sparse so existing adjustment records created
   * before this field existed don't fail validation.
   */
  adjustmentNumber?: string;
  inventoryItemId: mongoose.Types.ObjectId;
  adjustmentType: AdjustmentType;
  /** Quantity added, removed, or the absolute value to SET */
  quantityAdjusted: number;
  /** Snapshot of quantity before this adjustment */
  previousQuantity: number;
  /** Snapshot of quantity after this adjustment */
  newQuantity: number;
  reason?: string;
  notes?: string;
  adjustedBy: string; // userId string
  createdAt: Date;
  updatedAt: Date;
}

const StockAdjustmentSchema = new Schema<IStockAdjustment>(
  {
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    adjustmentNumber: { type: String, sparse: true },
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Inventory",
      index: true,
    },
    adjustmentType: {
      type: String,
      enum: ["ADD", "REMOVE", "SET"],
      required: true,
    },
    quantityAdjusted: { type: Number, required: true },
    previousQuantity: { type: Number, required: true },
    newQuantity: { type: Number, required: true },
    reason: { type: String },
    notes: { type: String },
    adjustedBy: { type: String, required: true },
  },
  { timestamps: true }
);

// adjustmentNumber was GLOBALLY unique -- same cross-business collision
// risk as PurchaseOrder.poNumber: scoped per-business instead.
StockAdjustmentSchema.index({ businessId: 1, adjustmentNumber: 1 }, { unique: true, sparse: true });

const StockAdjustment: Model<IStockAdjustment> =
  (mongoose.models.StockAdjustment as Model<IStockAdjustment>) ||
  mongoose.model<IStockAdjustment>("StockAdjustment", StockAdjustmentSchema);

export default StockAdjustment;
