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
export type TelegramMessageLayout = "FLAT" | "CARD";
export type TelegramMessageFooterTone = "NONE" | "SUCCESS" | "WARNING" | "DANGER" | "INFO";

export interface ITelegramMessageTemplate extends Document {
  key: string;
  channel: TelegramMessageChannel;
  template: string;
  enabled: boolean;
  // Card-style presentation, on top of the raw `template` wording -- see
  // core/telegram/renderCard.ts's applyCardStyle(), used by both the
  // report builder (lib/telegramReport.ts) and the notification sender
  // (sendVendorTelegramMessage.ts). All optional/no-ops for FLAT layout so
  // every pre-existing template row keeps behaving exactly as before.
  icon?: string; // emoji prefix on the title -- Telegram messages are plain
  // text/HTML, so an emoji is the only "icon" that actually renders inline
  // (lucide-react icons from the app's icon registry can't be sent as text)
  layout?: TelegramMessageLayout;
  footerTone?: TelegramMessageFooterTone;
  footerText?: string; // supports the same {{token}} placeholders as `template`
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
    icon: { type: String, trim: true },
    layout: { type: String, enum: ["FLAT", "CARD"], default: "FLAT" },
    footerTone: { type: String, enum: ["NONE", "SUCCESS", "WARNING", "DANGER", "INFO"], default: "NONE" },
    footerText: { type: String },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

const TelegramMessageTemplate: Model<ITelegramMessageTemplate> =
  mongoose.models.TelegramMessageTemplate ||
  mongoose.model<ITelegramMessageTemplate>("TelegramMessageTemplate", TelegramMessageTemplateSchema);

export default TelegramMessageTemplate;
