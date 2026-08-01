/**
 * TelegramUser — one row per Telegram chat (personal DM or group) that has
 * ever messaged the bot, independent of whether it's linked to a business
 * yet. Every other Telegram record in this app (Business.telegramChatId)
 * only exists once someone pastes a chat id into Settings; this table
 * exists to capture the chat itself the moment it first talks to the bot
 * (name, username, whether it's a group, when first/last seen, which
 * businesses it ends up linked to) -- a real directory of "everyone who
 * has ever touched our Telegram bot," not just the ones who finished
 * onboarding.
 *
 * Dual-written to central-api (dataset "telegram-users") same as
 * Business/Customer/etc, so other AN group properties can read this same
 * registry -- see lib/centralApiSync.ts's top comment for the phase-A
 * dual-write convention this follows.
 */
import mongoose, { Schema, Model, Document, Types } from "mongoose";
import { syncRecordToCentralApi } from "@/lib/centralApiSync";

export interface ITelegramUser extends Document {
  chatId: string;
  chatType: "private" | "group" | "supergroup" | "channel";
  // Personal-chat fields (from Telegram's `from`) -- absent for groups.
  firstName?: string;
  lastName?: string;
  username?: string;
  // Group-chat field (from Telegram's `chat.title`) -- absent for DMs.
  title?: string;
  // Every business this chat id is currently pasted into
  // Business.telegramChatId for -- kept in sync opportunistically
  // (recomputed on each incoming message), not a hard foreign key.
  linkedBusinessIds: Types.ObjectId[];
  lastCommand?: string;
  messageCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TelegramUserSchema = new Schema<ITelegramUser>(
  {
    chatId: { type: String, required: true, unique: true, trim: true, index: true },
    chatType: { type: String, enum: ["private", "group", "supergroup", "channel"], required: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    username: { type: String, trim: true },
    title: { type: String, trim: true },
    linkedBusinessIds: { type: [Schema.Types.ObjectId], ref: "Business", default: [] },
    lastCommand: { type: String, trim: true },
    messageCount: { type: Number, default: 0 },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

TelegramUserSchema.post("findOneAndUpdate", async function (doc) {
  if (doc) await syncRecordToCentralApi("telegram-users", doc._id.toString(), doc.toObject ? doc.toObject() : doc);
});

const TelegramUser: Model<ITelegramUser> =
  (mongoose.models.TelegramUser as Model<ITelegramUser>) ||
  mongoose.model<ITelegramUser>("TelegramUser", TelegramUserSchema);

export default TelegramUser;
