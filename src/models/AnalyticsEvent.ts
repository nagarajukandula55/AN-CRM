/**
 * AN Group's own commercial-funnel tracking -- pricing page visits, trial
 * signups, checkout starts, payments, upgrades, renewals. This is
 * deliberately separate from the vendor-facing analytics the app already
 * has (SalesInvoice/CrmJobSheet based, see /vendor/analytics and
 * /console/common/analytics) -- those are a VENDOR's own business
 * numbers; this is AN Group's own supervision of how the PLATFORM itself
 * is acquiring and converting customers, per explicit direction ("this
 * analytics page is different from vendors because this is for our
 * supervision not for vendors").
 */
import mongoose, { Schema, Model, Document } from "mongoose";

export type AnalyticsEventType =
  | "PRICING_PAGE_VIEW"
  | "TRIAL_SIGNUP"
  | "PLAN_SELECTED"
  | "CHECKOUT_STARTED"
  | "PAYMENT_COMPLETED"
  | "UPGRADE"
  | "RENEWAL"
  | "CANCELLATION";

export interface IAnalyticsEvent extends Document {
  type: AnalyticsEventType;
  vendorId?: mongoose.Types.ObjectId;
  businessId?: mongoose.Types.ObjectId;
  planKey?: string;
  billingPeriod?: string;
  amount?: number;
  // Whether founding/launch pricing was active at the moment of this event
  // -- lets the admin view split "founding vs standard customer" numbers
  // without re-deriving it from the pricing-cutover date after the fact.
  isFoundingPricing?: boolean;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    type: {
      type: String,
      enum: ["PRICING_PAGE_VIEW", "TRIAL_SIGNUP", "PLAN_SELECTED", "CHECKOUT_STARTED", "PAYMENT_COMPLETED", "UPGRADE", "RENEWAL", "CANCELLATION"],
      required: true,
      index: true,
    },
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile" },
    businessId: { type: Schema.Types.ObjectId, ref: "Business" },
    planKey: { type: String },
    billingPeriod: { type: String },
    amount: { type: Number },
    isFoundingPricing: { type: Boolean },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AnalyticsEventSchema.index({ type: 1, createdAt: -1 });

const AnalyticsEvent: Model<IAnalyticsEvent> =
  (mongoose.models.AnalyticsEvent as Model<IAnalyticsEvent>) ||
  mongoose.model<IAnalyticsEvent>("AnalyticsEvent", AnalyticsEventSchema);

export default AnalyticsEvent;
