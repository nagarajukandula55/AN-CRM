import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * One billing-cycle invoice generated against a VendorSubscription. Payment
 * is currently a stub (see core/billing/paymentGateway.ts) — paymentLink and
 * gatewayRef are shaped so a real gateway (Razorpay/Skydo) can be dropped in
 * later without a schema change: gatewayRef holds whatever reference ID that
 * gateway returns, paymentLink is the URL the vendor is sent to.
 */
export interface IVendorBillingInvoice extends Document {
  vendorId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  invoiceNumber: string;
  modules: { key: string; rate: number }[];
  amount: number;
  periodStart: Date;
  periodEnd: Date;
  status: "PENDING" | "PAID" | "CANCELLED";
  paymentLink: string;
  gatewayRef: string;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const VendorBillingInvoiceSchema = new Schema<IVendorBillingInvoice>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", required: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "VendorSubscription", required: true },
    invoiceNumber: { type: String, required: true, unique: true },
    modules: [{ key: String, rate: Number, _id: false }],
    amount: { type: Number, required: true, min: 0 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: { type: String, enum: ["PENDING", "PAID", "CANCELLED"], default: "PENDING" },
    paymentLink: { type: String, default: "" },
    gatewayRef: { type: String, default: "" },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

VendorBillingInvoiceSchema.index({ vendorId: 1, createdAt: -1 });
VendorBillingInvoiceSchema.index({ businessId: 1, status: 1 });

const VendorBillingInvoice: Model<IVendorBillingInvoice> =
  mongoose.models.VendorBillingInvoice ||
  mongoose.model<IVendorBillingInvoice>("VendorBillingInvoice", VendorBillingInvoiceSchema);

export default VendorBillingInvoice;
