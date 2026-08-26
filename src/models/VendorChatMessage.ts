import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A single message in a vendor's inbuilt support chat -- rides on their
 * already-linked PERSONAL Telegram chat (VendorProfile.telegramPersonalChatId),
 * never the group chat. Personal chats are the natural isolation boundary:
 * the linking flow (api/telegram/webhook's /start <code> or /link VND0001
 * handler) only ever sets telegramPersonalChatId from a message the vendor
 * sent from THEIR OWN Telegram account, so one personal chatId can only
 * ever belong to one vendor -- unlike a group chat, which this app's own
 * webhook comment documents CAN legitimately be linked to more than one
 * vendor (a shared team group), which would make chat isolation unsafe
 * there. Scoping the inbuilt chat to personal-only sidesteps that entirely.
 */
export interface IVendorChatMessage extends Document {
  vendorId: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  direction: "outbound" | "inbound";
  text: string;
  telegramMessageId: string;
  // "<adminChatId>:<messageId>" for every admin chat (ANOPS_TELEGRAM_
  // ADMIN_CHAT_IDS, see api/telegram/webhook) this inbound message was
  // forwarded/tagged into -- set only on inbound messages that were
  // successfully relayed. One admin can just hit "Reply" on that
  // forwarded copy in their own Telegram app; the webhook matches the
  // reply's "<chat.id>:<reply_to_message.message_id>" back to one of
  // these entries to know which vendor to relay the reply to, instead of
  // requiring a console visit for every single reply. An array (not a
  // single id) because the admin allowlist can hold more than one chat.
  adminRelayMessageIds?: string[];
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VendorChatMessageSchema = new Schema<IVendorChatMessage>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: "VendorProfile", required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    direction: { type: String, enum: ["outbound", "inbound"], required: true },
    text: { type: String, required: true },
    telegramMessageId: { type: String, default: "" },
    adminRelayMessageIds: { type: [String], default: [], index: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

VendorChatMessageSchema.index({ vendorId: 1, createdAt: 1 });

const VendorChatMessage: Model<IVendorChatMessage> =
  mongoose.models.VendorChatMessage || mongoose.model<IVendorChatMessage>("VendorChatMessage", VendorChatMessageSchema);

export default VendorChatMessage;
