/**
 * POST /api/telegram/webhook — receives Telegram bot updates for this app.
 * As of the central-api Telegram relay (central-api's app.js
 * relayToSites()), this route is normally reached via a forward from
 * central-api rather than a direct call from Telegram: ONE shared bot's
 * webhook is registered on central-api, and any message from a chat other
 * than central-api's own designated ops chat gets relayed here verbatim.
 * That means requests here now carry an `x-api-key` header (central-api
 * reuses this site's own key, the same one this app already sends as
 * CENTRAL_API_KEY on outbound calls) instead of Telegram's own
 * `x-telegram-bot-api-secret-token` -- verified below. Still works as a
 * standalone direct Telegram webhook (no relay) if CENTRAL_API_KEY isn't
 * set, for a business running without central-api at all.
 *
 * See lib/telegram.ts for the bot token this shares, ANOPS_TELEGRAM_BOT_TOKEN
 * -- one bot serves every business, each business just supplies its own
 * destination chat id in Settings.
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
 *   /runjobs       — manually runs every due scheduled job right now (see
 *                    lib/cronRunner.ts), as a "run now" alternative to
 *                    setting up an external scheduler for
 *                    /api/cron/run-all. This is NOT real cron -- nothing
 *                    fires unless a human sends this command -- so it only
 *                    makes sense for someone checking in periodically
 *                    rather than wanting unattended automation. Restricted
 *                    to chat ids listed in ANOPS_TELEGRAM_ADMIN_CHAT_IDS
 *                    (comma-separated) since this touches every business's
 *                    data, not just the sender's own.
 *
 * A chat can be linked to more than one business (nothing stops the same
 * Telegram chat id being pasted into two businesses' Settings) -- every
 * command that looks up "the business for this chat" loops over all
 * matches rather than assuming exactly one.
 *
 * Public route (see middleware.ts) — neither Telegram nor central-api's
 * relay can attach our session cookie/JWT. Request-level auth instead: if
 * CENTRAL_API_KEY is set, every request MUST carry a matching `x-api-key`
 * header (central-api is the only expected caller in that mode) or it's
 * rejected outright, before any command logic runs -- otherwise anyone who
 * finds this URL could feed it fabricated Telegram updates. If
 * CENTRAL_API_KEY is unset, the route falls back to accepting direct
 * Telegram calls unauthenticated, same as before the relay existed.
 *
 * One-time setup:
 *  - With the central-api relay (recommended): set this site's
 *    botWebhookUrl in central-api's admin dashboard (Sites tab) to
 *    <your-domain>/api/telegram/webhook -- see central-api's README
 *    section 13. Nothing to register with Telegram directly.
 *  - Standalone (no central-api relay): register this URL with Telegram
 *    directly by calling
 *    https://api.telegram.org/bot<token>/setWebhook?url=<your-domain>/api/telegram/webhook
 *    (see /api/telegram/set-webhook for a server-side way to do this).
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import VendorProfile from "@/models/VendorProfile";
import { sendTelegramMessage } from "@/lib/telegram";
import { buildReportMessage, periodStart, computePeriodNumbers, fmtINR } from "@/lib/telegramReport";
import { runAllDueCronJobs } from "@/lib/cronRunner";

function isAdminChat(chatId: number | string): boolean {
  const allowlist = (process.env.ANOPS_TELEGRAM_ADMIN_CHAT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowlist.includes(String(chatId));
}

const HELP_TEXT = [
  "<b>AN CRM Bot — Commands</b>",
  "",
  "/link CODE — link this chat to your business using the one-time code from Settings > Operations, and start receiving reports automatically",
  "/link VND0001 — or link straight from your Vendor ID (no code needed) -- send it from your team GROUP to set the group chat, and separately from your OWN personal chat to set your personal chat",
  "/tgid — show this chat's Telegram ID (paste into Settings > Operations)",
  "/today — quick revenue &amp; activity snapshot, today vs. yesterday",
  "/report — full period report for every business linked to this chat",
  "/runjobs — (admin only) manually run every due scheduled job now",
  "/help — this list",
].join("\n");

// A Vendor ID (VendorProfile.vendorId, see core/numbering/types.ts's
// VENDOR: "VND" prefix) looks like "VND0001" -- distinguishes the new
// vendor-id linking path from the existing one-time telegramLinkCode
// below without needing a separate command to remember.
const VENDOR_ID_RE = /^VND\d+$/i;

async function sendToChat(chatId: number | string, text: string) {
  await sendTelegramMessage(text, { chatId: String(chatId), parseMode: "HTML" });
}

export async function POST(req: NextRequest) {
  try {
    const centralApiKey = process.env.CENTRAL_API_KEY;
    if (centralApiKey && req.headers.get("x-api-key") !== centralApiKey) {
      return NextResponse.json({ success: false }, { status: 403 });
    }

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

    // In a group/supergroup, Telegram appends "@YourBotUsername" to every
    // command (e.g. "/link@MyBizFlowBot ABC123") -- matching the bare
    // command string here always silently failed for exactly the case
    // that matters most (linking a vendor's TEAM group, not a solo DM).
    // Strip the "@..." suffix before comparing.
    const command = text.trim().split(/\s+/)[0].toLowerCase().replace(/@\S+$/, "");

    await connectDB();

    if (command === "/link") {
      const arg = text.trim().split(/\s+/)[1]?.trim().toUpperCase();
      if (!arg) {
        await sendToChat(chatId, "Usage: <code>/link CODE</code> or <code>/link VND0001</code> (your Vendor ID) — get either from Settings &gt; Operations &gt; Telegram in the app first.");
        return NextResponse.json({ success: true });
      }

      const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";

      // Vendor-ID path: send the SAME Vendor ID from two different
      // chats to configure both destinations independently -- send it
      // from your team GROUP once (sets telegramChatId), then again
      // from your own personal DM with the bot (sets
      // telegramPersonalChatId). No one-time code to generate/copy.
      // Per explicit direction ("send our bot should give confirmation
      // and take that tgid and add that group id as group and personal
      // id to person tgid automatically").
      if (VENDOR_ID_RE.test(arg)) {
        const vendor = await VendorProfile.findOne({ vendorId: arg, isDeleted: { $ne: true } }).select("companyName businessId");
        if (!vendor || !vendor.businessId) {
          await sendToChat(chatId, `No vendor found for <code>${arg}</code>. Double-check the Vendor ID in your Profile page and try again.`);
          return NextResponse.json({ success: true });
        }
        const business = await Business.findById(vendor.businessId);
        if (!business) {
          await sendToChat(chatId, `Vendor <code>${arg}</code> has no active business on file yet. Contact support.`);
          return NextResponse.json({ success: true });
        }

        if (isGroup) {
          business.telegramChatId = String(chatId);
        } else {
          business.telegramPersonalChatId = String(chatId);
        }
        if (!business.telegramReportFrequency || business.telegramReportFrequency === "NONE") {
          business.telegramReportFrequency = "DAILY";
        }
        await business.save();

        await sendToChat(
          chatId,
          `✅ Confirmed. <b>${vendor.companyName || business.name}</b> (${arg}) is now linked -- this ${isGroup ? "group" : "personal chat"} will receive ${isGroup ? "team" : "your own"} automated reports (daily by default — change the schedule any time in Settings).\n\nSending your first report now…`
        );

        try {
          const isSC = (business.operatingMode || "SC") === "SC";
          const { text: reportText } = await buildReportMessage(business.name, business.telegramReportFrequency, isSC, String(business._id), new Date());
          await sendToChat(chatId, reportText);
        } catch (err) {
          console.error("[telegram-webhook] /link (vendor id) first-report failed:", err);
        }

        return NextResponse.json({ success: true });
      }

      // Legacy path: a one-time code generated from Settings > Operations
      // > Telegram. Always sets the group chat id (unchanged behavior) --
      // this path predates per-chat personal/group distinction; use the
      // Vendor ID path above to set the personal chat specifically.
      const business = await Business.findOne({ telegramLinkCode: arg, telegramLinkCodeExpiresAt: { $gt: new Date() } });
      if (!business) {
        await sendToChat(chatId, "That code is invalid or has expired. Generate a new one from Settings &gt; Operations &gt; Telegram, or send your Vendor ID (e.g. <code>VND0001</code>) instead.");
        return NextResponse.json({ success: true });
      }
      business.telegramChatId = String(chatId);
      business.telegramLinkCode = undefined;
      business.telegramLinkCodeExpiresAt = undefined;
      if (!business.telegramReportFrequency || business.telegramReportFrequency === "NONE") {
        business.telegramReportFrequency = "DAILY";
      }
      await business.save();

      await sendToChat(
        chatId,
        `✅ Linked to <b>${business.name}</b>. ${isGroup ? "This group" : "This chat"} will now receive automated reports (daily by default — change the schedule any time in Settings).\n\nSending your first report now…`
      );

      try {
        const isSC = (business.operatingMode || "SC") === "SC";
        const { text: reportText } = await buildReportMessage(business.name, business.telegramReportFrequency, isSC, String(business._id), new Date());
        await sendToChat(chatId, reportText);
      } catch (err) {
        console.error("[telegram-webhook] /link first-report failed:", err);
      }

      return NextResponse.json({ success: true });
    }

    if (/^\/(tgid|start)\b/i.test(command)) {
      const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
      const reply = isGroup
        ? `This group's Telegram ID is:\n<code>${chatId}</code>\n\nEasiest setup: in the app go to Settings &gt; Operations &gt; Telegram and click "Generate Link Code", then send <code>/link CODE</code> here — no copy-pasting needed and reports start right away. Or paste this ID directly into the Telegram Chat/Group ID field yourself.\n\nSend /help to see everything this bot can do.`
        : `Your Telegram ID is:\n<code>${chatId}</code>\n\nEasiest setup: in the app go to Settings &gt; Operations &gt; Telegram and click "Generate Link Code", then send <code>/link CODE</code> here — no copy-pasting needed and reports start right away. Or paste this ID directly into the Telegram Chat/Group ID field yourself.\n\nSend /help to see everything this bot can do.`;
      await sendToChat(chatId, reply);
      return NextResponse.json({ success: true });
    }

    if (command === "/help") {
      await sendToChat(chatId, HELP_TEXT);
      return NextResponse.json({ success: true });
    }

    if (command === "/runjobs") {
      if (!isAdminChat(chatId)) {
        await sendToChat(chatId, "This command is restricted to platform admins.");
        return NextResponse.json({ success: true });
      }
      await connectDB();
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      if (!baseUrl) {
        await sendToChat(chatId, "NEXT_PUBLIC_APP_URL isn't set, so I can't call the job routes. Set it in your env vars first.");
        return NextResponse.json({ success: true });
      }
      await sendToChat(chatId, "Running due jobs now…");
      const results = await runAllDueCronJobs(baseUrl);
      const lines = Object.entries(results).map(([key, status]) => `${key}: ${status}`);
      await sendToChat(chatId, `<b>Job run complete</b>\n<pre>${lines.join("\n")}</pre>`);
      return NextResponse.json({ success: true });
    }

    if (command === "/today" || command === "/report") {
      await connectDB();
      // Matches either the group chat id OR the personal chat id -- was
      // group-only, so a vendor asking from their own personal DM (which
      // Settings supports configuring separately) got "not linked" even
      // when their personal chat id was set correctly.
      const businesses = await Business.find({
        $or: [{ telegramChatId: String(chatId) }, { telegramPersonalChatId: String(chatId) }],
        isActive: true,
      }).select("name operatingMode telegramReportFrequency");

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
