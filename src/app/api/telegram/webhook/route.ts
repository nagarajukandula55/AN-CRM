/**
 * POST /api/telegram/webhook — Telegram calls this whenever a user messages
 * our bot (see lib/telegram.ts for the bot token this shares,
 * ANOPS_TELEGRAM_BOT_TOKEN — one bot serves every business, each business
 * just supplies its own destination chat id in Settings).
 *
 * Commands:
 *   /start, /tgid  — replies with the chat id the message came from, which
 *                    the user then pastes into Settings > Operations >
 *                    Telegram Chat/Group ID. Works the same whether it's a
 *                    personal DM or the bot added to a group (group chat
 *                    ids are negative numbers, exactly the value Settings
 *                    expects).
 *   /help          — lists every command.
 *   /today         — on-demand snapshot (today vs. yesterday) for every
 *                    business whose Telegram Chat/Group ID matches this
 *                    chat, without waiting for the scheduled report.
 *   /report        — on-demand full report using each matching business's
 *                    own configured frequency (DAILY/WEEKLY/MONTHLY,
 *                    defaulting to DAILY if unset) -- same message shape as
 *                    the scheduled one in
 *                    api/cron/telegram-business-report, via
 *                    lib/telegramReport.ts's shared builder.
 *
 * A chat can be linked to more than one business (nothing stops the same
 * Telegram chat id being pasted into two businesses' Settings) -- every
 * command that looks up "the business for this chat" loops over all
 * matches rather than assuming exactly one.
 *
 * Public route (see middleware.ts) — Telegram has no way to attach our
 * session cookie/JWT. /tgid and /help need no auth (they only ever echo
 * back the numeric id of whichever chat sent the message, or static text).
 * /today and /report only ever read data for businesses that already
 * chose to link this exact chat id in their own Settings page, which is
 * the access control here -- equivalent to a shared secret only that
 * business's admin could have pasted in.
 *
 * One-time setup (not done automatically): register this URL with Telegram
 * by calling
 *   https://api.telegram.org/bot<token>/setWebhook?url=<your-domain>/api/telegram/webhook
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import { sendTelegramMessage } from "@/lib/telegram";
import { buildReportMessage, periodStart, computePeriodNumbers, fmtINR } from "@/lib/telegramReport";

const HELP_TEXT = [
  "<b>AN CRM Bot — Commands</b>",
  "",
  "/tgid — show this chat's Telegram ID (paste into Settings > Operations)",
  "/today — quick revenue &amp; activity snapshot, today vs. yesterday",
  "/report — full period report for every business linked to this chat",
  "/help — this list",
].join("\n");

async function sendToChat(chatId: number | string, text: string) {
  await sendTelegramMessage(text, { chatId: String(chatId), parseMode: "HTML" });
}

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
    if (!chatId || !text) {
      return NextResponse.json({ success: true });
    }

    const command = text.trim().split(/\s+/)[0].toLowerCase();

    if (/^\/(tgid|start)\b/i.test(command)) {
      const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
      const reply = isGroup
        ? `This group's Telegram ID is:\n<code>${chatId}</code>\n\nPaste it into Settings &gt; Operations &gt; Telegram Chat/Group ID to receive this business's reports here.\n\nSend /help to see everything this bot can do.`
        : `Your Telegram ID is:\n<code>${chatId}</code>\n\nPaste it into Settings &gt; Operations &gt; Telegram Chat/Group ID to receive your reports and alerts.\n\nSend /help to see everything this bot can do.`;
      await sendToChat(chatId, reply);
      return NextResponse.json({ success: true });
    }

    if (command === "/help") {
      await sendToChat(chatId, HELP_TEXT);
      return NextResponse.json({ success: true });
    }

    if (command === "/today" || command === "/report") {
      await connectDB();
      const businesses = await Business.find({ telegramChatId: String(chatId), isActive: true }).select("name operatingMode telegramReportFrequency");

      if (businesses.length === 0) {
        await sendToChat(
          chatId,
          "No business is linked to this chat yet. Paste this chat's ID (/tgid) into Settings &gt; Operations &gt; Telegram Chat/Group ID first."
        );
        return NextResponse.json({ success: true });
      }

      const now = new Date();
      for (const business of businesses) {
        const isSC = (business.operatingMode || "SC") === "SC";
        try {
          if (command === "/today") {
            const from = periodStart("DAILY", now);
            const [current, prior] = await Promise.all([
              computePeriodNumbers(String(business._id), isSC, from, now),
              computePeriodNumbers(String(business._id), isSC, periodStart("DAILY", from), from),
            ]);
            const activityLabel = isSC ? "Workorders" : "Calls";
            const msg = [
              `<b>${business.name} — Today</b>`,
              "",
              "<pre>",
              `Revenue      ${fmtINR(current.revenue).padEnd(14)} (yesterday ${fmtINR(prior.revenue)})`,
              `Invoices     ${String(current.invoices).padEnd(14)} (yesterday ${prior.invoices})`,
              `${activityLabel.padEnd(12)} ${String(current.activity).padEnd(14)} (yesterday ${prior.activity})`,
              "</pre>",
            ].join("\n");
            await sendToChat(chatId, msg);
          } else {
            const frequency = business.telegramReportFrequency && business.telegramReportFrequency !== "NONE" ? business.telegramReportFrequency : "DAILY";
            const { text: reportText } = await buildReportMessage(business.name, frequency, isSC, String(business._id), now);
            await sendToChat(chatId, reportText);
          }
        } catch (err) {
          console.error(`[telegram-webhook] ${command} failed for business ${business._id}:`, err);
        }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch {
    // Telegram retries on non-2xx -- always ack so a transient parsing
    // hiccup doesn't cause a retry storm.
    return NextResponse.json({ success: true });
  }
}
