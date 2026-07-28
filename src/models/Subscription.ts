/**
 * Subscription — the licensing/billing record behind "activation, purchase
 * verification, license days, autonomous suspend on expiry" per explicit
 * direction. One row per paying entity: a Business (the primary plan) or a
 * Vendor (a sub-vendor addon charge, see subVendorOf below) -- both share
 * this model since the lifecycle (order -> verify -> active -> expiry ->
 * suspend) is identical either way.
 *
 * Razorpay is reused (already integrated for storefront orders -- see
 * services/order.service.ts) rather than a second payment provider, same
 * lazy-client pattern to avoid a missing-env-var build crash.
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";

export type SubscriptionPlan = "BASIC" | "PRO" | "ULTIMATE";
export type BillingPeriod = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";
export type SubscriptionStatus =
  | "TRIAL"           // within the free trial window, no payment yet
  | "PENDING_PAYMENT" // Razorpay order created, not yet verified
  | "ACTIVE"
  | "EXPIRED"         // past expiryDate -- set by the daily cron, blocks use
  | "CANCELLED";

export interface ISubscription extends Document {
  businessId: Types.ObjectId;
  // Set only for a sub-vendor addon charge (see api/vendors/[id]/sub-
  // vendors/route.ts) -- the parent vendor being charged for adding one
  // more sub-vendor under them. Unset for a business's own primary plan.
  subVendorOf?: Types.ObjectId; // ref VendorProfile
  // The operating mode this plan was purchased under (BRAND/SC/POS) --
  // pricing/features are mode-specific (see core/pricing/plans.ts), so the
  // same plan key ("PRO") means a different price/feature set per mode.
  // Snapshotted at purchase time from the business's own operatingMode so a
  // later business reconfiguration never reinterprets an old subscription.
  mode: "BRAND" | "SC" | "POS";
  plan: SubscriptionPlan;
  billingPeriod: BillingPeriod;
  status: SubscriptionStatus;
  amount: number; // INR, what was actually charged
  startDate?: Date;
  expiryDate?: Date;
  trialEndsAt?: Date;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  // Set when a sub-vendor addon charge (subVendorOf set) has actually been
  // spent creating that one sub-vendor -- prevents reusing the same paid
  // charge to create more than one sub-vendor. Irrelevant for a business's
  // own primary plan (subVendorOf unset).
  consumedAt?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    subVendorOf: { type: Schema.Types.ObjectId, ref: "VendorProfile", default: null, index: true },
    mode: { type: String, enum: ["BRAND", "SC", "POS"], required: true },
    plan: { type: String, enum: ["BASIC", "PRO", "ULTIMATE"], required: true },
    billingPeriod: { type: String, enum: ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"], required: true },
    status: { type: String, enum: ["TRIAL", "PENDING_PAYMENT", "ACTIVE", "EXPIRED", "CANCELLED"], default: "PENDING_PAYMENT", index: true },
    amount: { type: Number, required: true, min: 0 },
    startDate: { type: Date },
    expiryDate: { type: Date, index: true },
    trialEndsAt: { type: Date },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    consumedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ businessId: 1, status: 1, createdAt: -1 });

const Subscription: Model<ISubscription> =
  (mongoose.models.Subscription as Model<ISubscription>) ||
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);

export default Subscription;
