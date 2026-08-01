/**
 * Records/refreshes the TelegramUser row for whatever chat just messaged
 * the bot -- called once per incoming webhook update, regardless of which
 * command it was (or wasn't) recognized as, so the directory captures
 * every chat that has ever touched the bot, not just successful commands.
 */
import Business from "@/models/Business";
import TelegramUser from "@/models/TelegramUser";

export async function recordTelegramContact(message: any, command?: string): Promise<void> {
  try {
    const chat = message?.chat;
    const from = message?.from;
    if (!chat?.id) return;

    const chatId = String(chat.id);
    const isGroup = chat.type === "group" || chat.type === "supergroup";

    const linkedBusinesses = await Business.find({ telegramChatId: chatId }).select("_id");

    await TelegramUser.findOneAndUpdate(
      { chatId },
      {
        $set: {
          chatType: chat.type,
          ...(isGroup ? { title: chat.title } : { firstName: from?.first_name, lastName: from?.last_name, username: from?.username }),
          linkedBusinessIds: linkedBusinesses.map((b) => b._id),
          ...(command ? { lastCommand: command } : {}),
          lastSeenAt: new Date(),
          isActive: true,
        },
        $setOnInsert: { firstSeenAt: new Date() },
        $inc: { messageCount: 1 },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error("[telegram-users] failed to record contact:", err);
  }
}
