import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A record of every automated Telegram alert the system attempted to send
 * via sendVendorTelegramMessage -- the "Telegram notifications list" super
 * admin needs to audit what actually went out, per vendor, per type,
 * whether it succeeded. Write-only from the app's own send path; never
 * edited, just listed/filtered in the admin UI.
 */
export interface ITelegramLog extends Document {
  businessId: mongoose.Types.ObjectId;
  businessName?: string;
  type: string;
  text: string;
  sentToGroup: boolean;
  sentToPersonal: boolean;
  success: boolean;
  createdAt: Date;
}

const TelegramLogSchema = new Schema<ITelegramLog>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    businessName: { type: String },
    type: { type: String, required: true, index: true },
    text: { type: String, required: true },
    sentToGroup: { type: Boolean, default: false },
    sentToPersonal: { type: Boolean, default: false },
    success: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

TelegramLogSchema.index({ createdAt: -1 });

const TelegramLog: Model<ITelegramLog> =
  mongoose.models.TelegramLog || mongoose.model<ITelegramLog>("TelegramLog", TelegramLogSchema);

export default TelegramLog;
