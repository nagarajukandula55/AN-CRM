import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * One billing-cycle invoice generated against a VendorSubscription. Payment
 * goes through Razorpay (see core/billing/paymentGateway.ts) — gatewayRef
 * holds the Razorpay order id (set at pay-time), gatewayPaymentId the
 * actual payment id (set only once verified paid). Shaped so a second
 * gateway (Skydo) can be added later without a schema change beyond an
 * optional `gateway` discriminator.
 */
export interface IVendorBillingInvoice extends Document {
  vendorId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  invoiceNumber: string;
  modules: { key: string; rate: number }[];
  amount: number;
  // Snapshotted at invoice-creation time -- confirm/route.ts applies THESE
  // (not whatever the live VendorSubscription doc happens to hold) onto
  // the subscription only once payment is actually confirmed, so a vendor
  // can never get module access by merely creating an invoice and
  // abandoning checkout. See api/vendor/billing/subscribe/route.ts.
  validityDays: number;
  planKey: string | null;
  planName: string | null;
  periodStart: Date;
  periodEnd: Date;
  status: "PENDING" | "PAID" | "CANCELLED";
  paymentLink: string;
  gatewayRef: string;
  gatewayPaymentId: string;
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
    validityDays: { type: Number, default: 30 },
    planKey: { type: String, enum: ["BASIC", "PRO", "ULTIMATE", null], default: null },
    planName: { type: String, default: null },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: { type: String, enum: ["PENDING", "PAID", "CANCELLED"], default: "PENDING" },
    paymentLink: { type: String, default: "" },
    gatewayRef: { type: String, default: "" },
    // Razorpay's payment id (rzp_payment_id) once actually verified paid --
    // kept separate from gatewayRef (the ORDER id, set at pay-time before
    // any money moves) so the two can never be confused with each other.
    gatewayPaymentId: { type: String, default: "" },
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
