/**
 * Minimal Telegram notifier -- dependency-free (plain fetch). Used for
 * ops-report and catalog-request alerts. Reads bot token/chat id from env;
 * if either is missing, logs a warning and resolves to false instead of
 * throwing, so callers never crash the app just because Telegram isn't
 * configured yet in a given environment.
 */

export async function sendTelegramMessage(
  text: string,
  options?: { parseMode?: "HTML" | "MarkdownV2"; chatId?: string }
): Promise<boolean> {
  const token = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
  const chatId = options?.chatId || process.env.ANOPS_TELEGRAM_CHAT_ID;

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

/**
 * Sends a photo by URL (Telegram fetches it server-side, so this app never
 * has to download/store the image itself) with an optional caption -- used
 * for the automatic Telegram business report's trend chart, generated via
 * QuickChart (see api/cron/telegram-business-report/route.ts).
 */
export async function sendTelegramPhoto(
  photoUrl: string,
  options?: { caption?: string; chatId?: string }
): Promise<boolean> {
  const token = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
  const chatId = options?.chatId || process.env.ANOPS_TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[telegram] ANOPS_TELEGRAM_BOT_TOKEN / ANOPS_TELEGRAM_CHAT_ID not configured -- skipping photo send.");
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: options?.caption,
        parse_mode: "HTML",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[telegram] sendPhoto failed: ${res.status} ${res.statusText} ${body}`);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error("[telegram] sendPhoto threw:", err?.message || err);
    return false;
  }
}
