import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A vendor's billing plan: which modules they're charged for, at what rate
 * each, and the current paid-through period. One document per vendor.
 *
 * status:
 *  NOT_SET — Super Admin hasn't configured pricing for this vendor yet.
 *  UNPAID  — plan configured, invoice generated, not yet paid; vendor has
 *            no confirmed access period.
 *  ACTIVE  — currentPeriodEnd is in the future.
 *  EXPIRED — currentPeriodEnd has passed and no new payment confirmed.
 * Status is computed on read (see billing.service.ts), not stored as the
 * source of truth, so it can never drift from currentPeriodEnd.
 */
export interface IVendorSubscriptionModule {
  key: string;
  rate: number;
}

export interface IVendorSubscription extends Document {
  vendorId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  modules: IVendorSubscriptionModule[];
  validityDays: number;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  // Set when this subscription's modules/validityDays came from a
  // self-serve tier pick (see api/vendor/billing/subscribe) rather than an
  // admin hand-picking modules on console/admin/vendor-billing. planKey is
  // the BASIC/PRO/ULTIMATE tier off core/pricing/plans.ts (the single plan
  // catalog -- see that file's own comment); planName is a denormalized
  // snapshot at purchase time so a later admin edit to that tier's
  // name/features (via PlanFeatureConfig) never changes what an
  // already-active vendor's invoice/plan-page shows they bought.
  planKey: string | null;
  planName: string | null;
  // Last time the daily "choose & purchase a plan" Telegram reminder was
  // sent to this vendor (api/cron/trial-plan-reminders) -- unset once a
  // PAID invoice exists, since that cron only targets never-paid vendors.
  trialReminderLastSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const VendorSubscriptionSchema = new Schema<IVendorSubscription>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", required: true, unique: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    modules: [
      {
        key: { type: String, required: true },
        rate: { type: Number, required: true, min: 0 },
        _id: false,
      },
    ],
    validityDays: { type: Number, required: true, default: 30 },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    planKey: { type: String, enum: ["BASIC", "PRO", "ULTIMATE", null], default: null },
    planName: { type: String, default: null },
    trialReminderLastSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

VendorSubscriptionSchema.index({ businessId: 1 });

const VendorSubscription: Model<IVendorSubscription> =
  mongoose.models.VendorSubscription || mongoose.model<IVendorSubscription>("VendorSubscription", VendorSubscriptionSchema);

export default VendorSubscription;
