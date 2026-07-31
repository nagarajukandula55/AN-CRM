/**
 * POST /api/telegram/webhook — Telegram calls this whenever a user messages
 * our bot (see lib/telegram.ts for the bot token this shares,
 * ANOPS_TELEGRAM_BOT_TOKEN — one bot serves every business, each business
 * just supplies its own destination chat id in Settings).
 *
 * Only command handled today: /tgid (and /start, so a brand-new chat gets
 * the same reply without needing to know the command first) — replies with
 * the chat id the message came from, which the user then pastes into
 * Settings > Operations > Telegram Chat/Group ID. Works the same whether
 * it's a personal DM or the bot added to a group (group chat ids are
 * negative numbers, exactly the value Settings expects).
 *
 * Public route (see middleware.ts) — Telegram has no way to attach our
 * session cookie/JWT, and there's nothing here to protect: it can only ever
 * echo back the numeric id of whichever chat sent the message.
 *
 * One-time setup (not done automatically): register this URL with Telegram
 * by calling
 *   https://api.telegram.org/bot<token>/setWebhook?url=<your-domain>/api/telegram/webhook
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const token = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json({ success: true });
    }

    const update = await req.json();
    const message = update?.message || update?.edited_message;
    const chatId = message?.chat?.id;
    const text: string | undefined = message?.text;

    if (chatId && text && /^\/(tgid|start)\b/i.test(text.trim())) {
      const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
      const reply = isGroup
        ? `This group's Telegram ID is:\n\`${chatId}\`\n\nPaste it into Settings > Operations > Telegram Chat/Group ID to receive this business's reports here.`
        : `Your Telegram ID is:\n\`${chatId}\`\n\nPaste it into Settings > Operations > Telegram Chat/Group ID to receive your reports and alerts.`;

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: reply, parse_mode: "Markdown" }),
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    // Telegram retries on non-2xx -- always ack so a transient parsing
    // hiccup doesn't cause a retry storm.
    return NextResponse.json({ success: true });
  }
}
