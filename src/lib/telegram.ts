/**
 * Minimal Telegram notifier -- dependency-free (plain fetch). Used for
 * ops-report and catalog-request alerts. Reads bot token/chat id from env;
 * if either is missing, logs a warning and resolves to false instead of
 * throwing, so callers never crash the app just because Telegram isn't
 * configured yet in a given environment.
 */

export async function sendTelegramMessage(
  text: string,
  options?: { parseMode?: "HTML" | "MarkdownV2" }
): Promise<boolean> {
  const token = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ANOPS_TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[telegram] ANOPS_TELEGRAM_BOT_TOKEN / ANOPS_TELEGRAM_CHAT_ID not configured -- skipping send.");
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode ?? "HTML",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[telegram] sendMessage failed: ${res.status} ${res.statusText} ${body}`);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error("[telegram] sendMessage threw:", err?.message || err);
    return false;
  }
}
