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
export type TelegramMessageChannel = "TELEGRAM" | "WHATSAPP";

export interface ITelegramMessageTemplate extends Document {
  key: string;
  channel: TelegramMessageChannel;
  template: string;
  enabled: boolean;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TelegramMessageTemplateSchema = new Schema<ITelegramMessageTemplate>(
  {
    // Still one unique `key` per row (unchanged index, no migration needed
    // against the existing production collection) -- a WhatsApp variant of
    // an alert type is stored under a channel-namespaced key
    // ("NEW_WORKORDER__WHATSAPP", see templateKeyFor() below) rather than a
    // compound (key, channel) unique index, so the pre-existing unique
    // index on `key` alone keeps working exactly as before.
    key: { type: String, required: true, unique: true, uppercase: true, trim: true },
    // Informational only -- which channel this row's wording is for. The
    // real Telegram-vs-WhatsApp split for a given alert type is which `key`
    // string is used (see templateKeyFor()), not this field; it just makes
    // the row self-describing without having to parse the key.
    channel: { type: String, enum: ["TELEGRAM", "WHATSAPP"], default: "TELEGRAM" },
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
