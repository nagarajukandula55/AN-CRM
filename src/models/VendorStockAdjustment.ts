import mongoose, { Schema, Model, Document, Types } from "mongoose";

/**
 * VendorStockAdjustment — the legal, auditable way a vendor gets stock
 * INTO the system for a product they've already listed. Every adjustment
 * is a permanent record (who, when, why, before/after quantity) against
 * NativeProduct.stock, the same field the storefront reads for "in stock".
 *
 * Deliberately a separate, lighter model from the existing
 * models/StockAdjustment.ts (which references models/Inventory.js's
 * warehouse+ProductVariant-based ERP inventory system) -- that system
 * tracks the internal manufacturing/procurement catalog (ProductVariant),
 * not a vendor's own NativeProduct listing on the storefront. Bridging the
 * two would require every vendor product to also exist as a full
 * ProductVariant with its own Inventory row, which nothing in the
 * vendor-product-wizard pipeline sets up today. This is the minimal,
 * correct model for what a vendor actually needs: inbound receipts against
 * their own storefront listing's stock count.
 */
export type VendorStockAdjustmentType = "INBOUND" | "CORRECTION" | "DAMAGED" | "RETURN";

export interface IVendorStockAdjustment extends Document {
  businessId: Types.ObjectId;
  vendorId: Types.ObjectId;
  productId: Types.ObjectId; // ref NativeProduct
  adjustmentNumber: string;
  type: VendorStockAdjustmentType;
  quantity: number; // always positive; type determines sign
  previousStock: number;
  newStock: number;
  reason?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const VendorStockAdjustmentSchema = new Schema<IVendorStockAdjustment>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "NativeProduct", required: true, index: true },
    adjustmentNumber: { type: String, required: true, index: true },
    type: { type: String, enum: ["INBOUND", "CORRECTION", "DAMAGED", "RETURN"], required: true },
    quantity: { type: Number, required: true, min: 0 },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    reason: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

VendorStockAdjustmentSchema.index({ businessId: 1, vendorId: 1, createdAt: -1 });

const VendorStockAdjustment: Model<IVendorStockAdjustment> =
  (mongoose.models.VendorStockAdjustment as Model<IVendorStockAdjustment>) ||
  mongoose.model<IVendorStockAdjustment>("VendorStockAdjustment", VendorStockAdjustmentSchema);

export default VendorStockAdjustment;
