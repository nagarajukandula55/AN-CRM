import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Direct admin broadcast -- sends straight to a fixed list of Telegram
 * chat ids via the shared bot (sendTelegramMessage's own credential
 * resolution: central-api's shared TELEGRAM integration first, then
 * ANOPS_TELEGRAM_BOT_TOKEN as a last-resort fallback), bypassing
 * central-api's own activity-key -> chat dashboard mapping entirely.
 *
 * -1004344655033 is AN Group's own admin ops group, per explicit
 * direction ("i should get admin notification on -1004344655033 telegram
 * group through bot") -- hardcoded so this reaches that group regardless
 * of whether it's also configured in central-api's dashboard or in
 * ANOPS_TELEGRAM_ADMIN_CHAT_IDS. Any additional ids in
 * ANOPS_TELEGRAM_ADMIN_CHAT_IDS (comma-separated -- see isAdminChat() in
 * api/telegram/webhook/route.ts, the same env var that already gates
 * which chats may run admin-only bot commands) get the same broadcast,
 * so a personal DM added there doesn't need a second code path.
 */
const ADMIN_GROUP_CHAT_ID = "-1004344655033";

export async function notifyAdmins(text: string): Promise<void> {
  const envIds = (process.env.ANOPS_TELEGRAM_ADMIN_CHAT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chatIds = Array.from(new Set([ADMIN_GROUP_CHAT_ID, ...envIds]));
  await Promise.allSettled(chatIds.map((chatId) => sendTelegramMessage(text, { chatId, parseMode: "HTML" })));
}
