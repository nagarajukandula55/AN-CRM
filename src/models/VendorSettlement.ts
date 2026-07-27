import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * VendorSettlement — one row per (order, vendor) pair, recording what the
 * vendor is owed for their line items on that order and the Razorpay
 * Route transfer attempted/completed for it. This is the audit trail for
 * vendor payouts — without it there'd be no record of what was
 * transferred, to whom, when, or why a transfer failed, which is not
 * acceptable for real money movement.
 */
export type SettlementStatus =
  | "PENDING"     // order captured, transfer not yet attempted (e.g. vendor not activated yet)
  | "TRANSFERRED" // Razorpay transfer created successfully
  | "FAILED"      // Razorpay transfer attempt failed
  | "ON_HOLD";    // manually held back (e.g. dispute, return window)

export interface IVendorSettlement extends Document {
  orderId: string;          // Order.orderId (string, not ObjectId — matches Order's own id field)
  vendorId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  payoutAccountId?: mongoose.Types.ObjectId;
  grossAmount: number;         // sum of this vendor's line items on this order
  platformCommissionPercent: number;
  platformCommissionAmount: number;
  netPayoutAmount: number;     // grossAmount - platformCommissionAmount
  razorpayTransferId?: string;
  status: SettlementStatus;
  failureReason?: string;
  transferredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const VendorSettlementSchema = new Schema<IVendorSettlement>(
  {
    orderId: { type: String, required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    payoutAccountId: { type: Schema.Types.ObjectId, ref: "VendorPayoutAccount" },
    grossAmount: { type: Number, required: true },
    platformCommissionPercent: { type: Number, required: true },
    platformCommissionAmount: { type: Number, required: true },
    netPayoutAmount: { type: Number, required: true },
    razorpayTransferId: { type: String, index: true },
    status: {
      type: String,
      enum: ["PENDING", "TRANSFERRED", "FAILED", "ON_HOLD"],
      default: "PENDING",
      index: true,
    },
    failureReason: { type: String },
    transferredAt: { type: Date },
  },
  { timestamps: true }
);

// One settlement row per (order, vendor) — a vendor shouldn't get two
// separate settlement rows for the same order even if it's reprocessed.
VendorSettlementSchema.index({ orderId: 1, vendorId: 1 }, { unique: true });

const VendorSettlement: Model<IVendorSettlement> =
  mongoose.models.VendorSettlement ||
  mongoose.model<IVendorSettlement>("VendorSettlement", VendorSettlementSchema);

export default VendorSettlement;
