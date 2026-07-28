/**
 * CommunicationQuota — per-business monthly usage/limit tracking for
 * platform-sent email (via the shared Resend account, on the business's
 * behalf) and WhatsApp (via a centrally-held subscription), per explicit
 * direction: "provide per month free emails and whatsapp messages to
 * user... it should be like we have resend for our emails and all... we
 * have to work on their behalf and it should not known by them and
 * whatsapp we will take subscription centrally and plan a quota of
 * messages."
 *
 * "Work on their behalf, not known to them" means: the platform's own
 * Resend API key sends the email (see services/email/resend.service.ts),
 * with this business's name/reply-to as the from-identity -- NOT a
 * separate Resend account this business has to sign up for or ever see.
 * This model is purely the quota ledger; actual sending stays wherever it
 * already happens, gated by checkAndIncrementQuota() below.
 */

import mongoose, { Schema, Model, Document, Types } from "mongoose";

export interface ICommunicationQuota extends Document {
  businessId: Types.ObjectId;
  emailEnabled: boolean;
  emailQuota: number; // messages allowed per periodStart..periodStart+1mo
  emailUsed: number;
  whatsappEnabled: boolean;
  whatsappQuota: number;
  whatsappUsed: number;
  periodStart: Date; // resets emailUsed/whatsappUsed to 0 when a new month starts
  createdAt: Date;
  updatedAt: Date;
}

const CommunicationQuotaSchema = new Schema<ICommunicationQuota>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, unique: true, index: true },
    emailEnabled: { type: Boolean, default: false },
    emailQuota: { type: Number, default: 200 },
    emailUsed: { type: Number, default: 0 },
    whatsappEnabled: { type: Boolean, default: false },
    whatsappQuota: { type: Number, default: 100 },
    whatsappUsed: { type: Number, default: 0 },
    periodStart: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const CommunicationQuota: Model<ICommunicationQuota> =
  (mongoose.models.CommunicationQuota as Model<ICommunicationQuota>) ||
  mongoose.model<ICommunicationQuota>("CommunicationQuota", CommunicationQuotaSchema);

export default CommunicationQuota;
