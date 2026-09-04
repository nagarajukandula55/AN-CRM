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
import { syncRecordToCentralApi, deleteRecordFromCentralApi } from "@/lib/centralApiSync";

export type SubscriptionPlan = "STARTER" | "BASIC" | "PRO" | "ULTIMATE";
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
  // Set only for an SC "add another SC account" addon charge (see
  // api/businesses/[id]/sub-accounts/route.ts) -- the parent SC business
  // being charged for spinning up one more SC business under itself.
  // Unset for a business's own primary plan and for subVendorOf charges.
  subBusinessOf?: Types.ObjectId; // ref Business
  // The operating mode this plan was purchased under -- SC-only now
  // (BRAND/POS removed, confirmed zero production usage). Snapshotted at
  // purchase time from the business's own operatingMode so a later
  // business reconfiguration never reinterprets an old subscription.
  mode: "SC";
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
    subBusinessOf: { type: Schema.Types.ObjectId, ref: "Business", default: null, index: true },
    mode: { type: String, enum: ["SC"], required: true },
    plan: { type: String, enum: ["STARTER", "BASIC", "PRO", "ULTIMATE"], required: true },
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

// CENTRAL-API SYNC (dual write, see src/lib/centralApiSync.ts). Best-effort
// - a central-api outage never fails the local save/update that triggered
// it. Awaited (async function + await, not fire-and-forget) so a Vercel
// serverless function can't be frozen mid-sync right after the response is
// sent - see Business.ts/VendorProfile.ts for the fuller version of this
// reasoning.
//
// Every field that matters for "subscription details, start date to end
// date" is already native to this schema (startDate, expiryDate,
// trialEndsAt, plan, billingPeriod, status, amount) and travels through
// automatically as part of the synced document - same for businessId and,
// for a sub-vendor addon charge, subVendorOf (the vendor's own _id), which
// is exactly the join key central-api needs to link a subscription back to
// its vendor/sub-vendor record in the "vendors" dataset.
//
// Covers save()/create() and findOneAndUpdate()/findByIdAndUpdate() - the
// atomic charge-claim-and-release in api/vendors/[id]/sub-vendors/route.ts
// uses the latter, so every state transition (PENDING_PAYMENT -> ACTIVE,
// the claim/release around consumedAt) syncs, not just creation.
SubscriptionSchema.post("save", async function (doc) {
  await syncRecordToCentralApi("subscriptions", doc._id.toString(), doc.toObject());
});

SubscriptionSchema.post("findOneAndUpdate", async function (doc) {
  // See Business.ts's identical hook for why this guards against .lean()
  // results (no .toObject()) instead of always calling it.
  if (doc) await syncRecordToCentralApi("subscriptions", doc._id.toString(), doc.toObject ? doc.toObject() : doc);
});

SubscriptionSchema.post("findOneAndDelete", async function (doc) {
  if (doc) await deleteRecordFromCentralApi("subscriptions", doc._id.toString());
});

const Subscription: Model<ISubscription> =
  (mongoose.models.Subscription as Model<ISubscription>) ||
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);

export default Subscription;
