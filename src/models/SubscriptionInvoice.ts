import mongoose, { Schema, Model, Document, Types } from "mongoose";

/**
 * Invoice raised against a Business (or sub-vendor addon charge) for an
 * AN-CRM Subscription payment -- generated automatically the moment
 * api/subscriptions/verify confirms the Razorpay signature, per explicit
 * direction ("we have to raise invoices once they paid right check for
 * that flow"). Deliberately its own lightweight model rather than reusing
 * SalesInvoice: this invoice is AN-CRM billing the tenant business for the
 * platform license itself, not the business billing its own customer --
 * conflating the two would corrupt SalesInvoice's per-business GST filing
 * numbering series (see NON_GST_INVOICE/B2B_INVOICE's own comments) with
 * unrelated platform-billing entries.
 */
export interface ISubscriptionInvoice extends Document {
  invoiceNumber: string;
  businessId: Types.ObjectId;
  subscriptionId: Types.ObjectId;
  subVendorOf?: Types.ObjectId;
  mode: "BRAND" | "SC" | "POS";
  plan: "BASIC" | "PRO" | "ULTIMATE";
  billingPeriod: "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";
  amount: number;
  taxTotal: number;
  grandTotal: number;
  periodStart: Date;
  periodEnd: Date;
  razorpayPaymentId: string;
  status: "PAID";
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionInvoiceSchema = new Schema<ISubscriptionInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", required: true },
    subVendorOf: { type: Schema.Types.ObjectId, ref: "VendorProfile", default: null },
    mode: { type: String, enum: ["BRAND", "SC", "POS"], required: true },
    plan: { type: String, enum: ["BASIC", "PRO", "ULTIMATE"], required: true },
    billingPeriod: { type: String, enum: ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"], required: true },
    amount: { type: Number, required: true, min: 0 },
    taxTotal: { type: Number, required: true, default: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    razorpayPaymentId: { type: String, required: true },
    status: { type: String, enum: ["PAID"], default: "PAID" },
  },
  { timestamps: true }
);

SubscriptionInvoiceSchema.index({ businessId: 1, createdAt: -1 });

const SubscriptionInvoice: Model<ISubscriptionInvoice> =
  (mongoose.models.SubscriptionInvoice as Model<ISubscriptionInvoice>) ||
  mongoose.model<ISubscriptionInvoice>("SubscriptionInvoice", SubscriptionInvoiceSchema);

export default SubscriptionInvoice;
