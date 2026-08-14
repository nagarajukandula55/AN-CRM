import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Super-admin-configured message text for one Telegram alert type (see
 * core/telegram/vendorMessageTypes.ts's catalog), applied platform-wide to
 * every vendor -- a vendor only ever chooses WHERE their alerts go (group/
 * personal, see Business.telegramMessageRouting), never the wording. One
 * document per type key; missing a key just means that type still uses its
 * hardcoded fallback text at the call site (see
 * core/telegram/sendVendorTelegramMessage.ts).
 */
export interface ITelegramMessageTemplate extends Document {
  key: string;
  template: string;
  enabled: boolean;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TelegramMessageTemplateSchema = new Schema<ITelegramMessageTemplate>(
  {
    key: { type: String, required: true, unique: true, uppercase: true, trim: true },
    template: { type: String, required: true },
    // Super-admin kill switch for this alert type platform-wide -- distinct
    // from a vendor's own Group/Personal routing checkboxes, which only
    // pick a destination, never whether the type fires at all.
    enabled: { type: Boolean, default: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

const TelegramMessageTemplate: Model<ITelegramMessageTemplate> =
  mongoose.models.TelegramMessageTemplate ||
  mongoose.model<ITelegramMessageTemplate>("TelegramMessageTemplate", TelegramMessageTemplateSchema);

export default TelegramMessageTemplate;
