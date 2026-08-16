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
import { buildReportMessage, buildTrendChartUrl, periodStart, computePeriodNumbers, fmtINR } from "@/lib/telegramReport";
import { sendBusinessReport } from "@/core/telegram/sendBusinessReport";
import { runAllDueCronJobs } from "@/lib/cronRunner";
import { getAllowedModuleKeys, getActivePlanKey } from "@/core/pricing/planAccess";
import { sendTelegramPhoto } from "@/lib/telegram";

// SECURITY/BILLING: "Automatic Telegram Business Report" is a paid,
// plan-gated feature (see core/pricing/plans.ts's "telegram-reports"
// moduleKey, ULTIMATE-tier only) -- the Settings UI hides the toggle for
// a lower-tier plan, and PATCH /api/businesses/[id] and the scheduled
// cron (api/cron/telegram-business-report) both re-check it server-side.
// This bot, though, is a THIRD path to the exact same report content --
// /link used to unconditionally turn telegramReportFrequency on, and
// /report built and sent the report with no plan check at all, so a
// Basic/Pro vendor got the paid feature for free just by messaging the
// bot. Checked here the same way the cron job already does.
async function hasTelegramReportsPlan(business: { _id: unknown; operatingMode?: string }): Promise<boolean> {
  const mode = (business.operatingMode || "SC") as "BRAND" | "SC" | "POS";
  const plan = await getActivePlanKey(String(business._id));
  const allowed = await getAllowedModuleKeys(mode, plan);
  return !allowed || allowed.includes("telegram-reports");
}

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
  "/link VND0001 — link this chat using your business's Vendor ID (Settings &gt; Integrations, or Vendors &gt; this business's profile) -- send it from your team GROUP to set the group chat, and separately from your OWN personal chat to set your personal chat. You can also just send <code>VND0001</code> alone, any time, with no /link needed -- or send /link with nothing after it and I'll ask you for it.",
  "/tgid — show this chat's Telegram ID",
  "/today — quick revenue &amp; activity snapshot, today vs. yesterday",
  "/report — full period report for every business linked to this chat",
  "/runjobs — (admin only) manually run every due scheduled job now",
  "/sendreports — (admin only) send every linked vendor their own business report right now",
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
  // Hoisted so the catch-all below can still reply to whichever chat sent
  // the message, even if the exception happened after we parsed it -- was
  // previously impossible to reach from inside `catch`, which is exactly
  // why an exception (e.g. Business.save() failing validation) produced
  // total silence with zero trace: the confirmation reply that would have
  // told the user is what threw, and nothing ever logged why.
  let chatIdForErrorReply: number | string | undefined;
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
    chatIdForErrorReply = chatId;

    // In a group/supergroup, Telegram appends "@YourBotUsername" to every
    // command (e.g. "/link@MyBizFlowBot ABC123") -- matching the bare
    // command string here always silently failed for exactly the case
    // that matters most (linking a vendor's TEAM group, not a solo DM).
    // Strip the "@..." suffix before comparing.
    const command = text.trim().split(/\s+/)[0].toLowerCase().replace(/@\S+$/, "");

    await connectDB();

    // Two ways in: `/link VND0001` in one message, OR just `/link` (with no
    // argument) which replies asking for the Vendor ID -- the very next
    // plain-text message from this same chat that looks like a Vendor ID
    // (VND\d+, matched below regardless of any /link command) completes
    // the link. No server-side "awaiting reply" state needed for that --
    // a bare Vendor ID is unambiguous and safe to treat as a link attempt
    // from any chat, any time, per explicit direction ("either it should
    // accept VND series number directly whenever any user sends message
    // to the group... or allow user to send /link then ask for input
    // vendor ID").
    if (command === "/link" || VENDOR_ID_RE.test(text.trim())) {
      const arg = (command === "/link" ? text.trim().split(/\s+/)[1] : text.trim())?.trim().toUpperCase();
      if (!arg || !VENDOR_ID_RE.test(arg)) {
        await sendToChat(chatId, "Send your business's own Vendor ID to link this chat -- e.g. <code>VND0001</code> (found in Settings &gt; Integrations, or Vendors &gt; this business's profile). You can send it alone or as <code>/link VND0001</code>.");
        return NextResponse.json({ success: true });
      }

      const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";

      // Send the SAME Vendor ID from two different chats to configure both
      // destinations independently -- send it from your team GROUP once
      // (sets telegramChatId), then again from your own personal DM with
      // the bot (sets telegramPersonalChatId). This is the ONLY linking
      // path -- the legacy one-time telegramLinkCode flow was removed
      // entirely per explicit direction ("this link command to be removed
      // totally... only plain vendor id should register this").
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
      const reportsAllowed = await hasTelegramReportsPlan(business);
      if (reportsAllowed && (!business.telegramReportFrequency || business.telegramReportFrequency === "NONE")) {
        business.telegramReportFrequency = "DAILY";
      }
      await business.save();

      const greetName = vendor.companyName || business.name;
      await sendToChat(
        chatId,
        reportsAllowed
          ? `👋 Hi <b>${greetName}</b>! Confirmed -- Vendor ID ${arg} is now linked, and this ${isGroup ? "group" : "personal chat"} will receive ${isGroup ? "team" : "your own"} automated reports (daily by default — change the schedule any time in Settings).\n\nSending your first report now…`
          : `👋 Hi <b>${greetName}</b>! Confirmed -- Vendor ID ${arg} is now linked, and this ${isGroup ? "group" : "personal chat"} can receive alerts, but automatic scheduled reports aren't included in your current plan. Upgrade from Plan &amp; Billing to turn those on.`
      );

      if (!reportsAllowed) {
        return NextResponse.json({ success: true });
      }

      try {
        const isSC = (business.operatingMode || "SC") === "SC";
        const { text: reportText } = await buildReportMessage(business.name, business.telegramReportFrequency, isSC, String(business._id), new Date());
        await sendToChat(chatId, reportText);
      } catch (err) {
        console.error("[telegram-webhook] /link (vendor id) first-report failed:", err);
      }

      return NextResponse.json({ success: true });
    }

    if (/^\/(tgid|start)\b/i.test(command)) {
      const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
      const reply = isGroup
        ? `This group's Telegram ID is:\n<code>${chatId}</code>\n\nEasiest setup: send <code>/link VND0001</code> here (this business's own Vendor ID, from Settings &gt; Integrations) and this group is linked immediately — no copy-pasting needed.\n\nSend /help to see everything this bot can do.`
        : `Your Telegram ID is:\n<code>${chatId}</code>\n\nEasiest setup: send <code>/link VND0001</code> here (this business's own Vendor ID, from Settings &gt; Integrations) and this chat is linked immediately — no copy-pasting needed.\n\nSend /help to see everything this bot can do.`;
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

    // The actual trigger for scheduled Telegram business reports -- NOT a
    // Vercel cron (deliberately not used here, per explicit direction).
    // A platform admin sends this from an allowlisted chat
    // (ANOPS_TELEGRAM_ADMIN_CHAT_IDS) and every vendor with a linked chat
    // gets their own report sent to their own configured chat(s) right
    // now -- each vendor's data stays scoped to their own business
    // exactly as sendBusinessReport() already enforces. Vendors can also
    // always pull their own report any time via /report -- this command
    // is only for bulk-sending to everyone at once.
    if (command === "/sendreports") {
      if (!isAdminChat(chatId)) {
        await sendToChat(chatId, "This command is restricted to platform admins.");
        return NextResponse.json({ success: true });
      }
      await connectDB();
      const candidates = await Business.find({
        $or: [{ telegramChatId: { $nin: [null, ""] } }, { telegramPersonalChatId: { $nin: [null, ""] } }],
        isActive: true,
      }).select("name operatingMode telegramChatId telegramPersonalChatId telegramReportFrequency");

      await sendToChat(chatId, `Sending reports to ${candidates.length} linked vendor(s)…`);
      let sent = 0;
      const skipped: string[] = [];
      for (const business of candidates) {
        try {
          const result = await sendBusinessReport(business);
          if (result.sent) sent++;
          else skipped.push(`${business.name} (${result.reason})`);
        } catch (err) {
          console.error(`[telegram-webhook] /sendreports failed for business ${business._id}:`, err);
          skipped.push(`${business.name} (error)`);
        }
      }
      const summary = [`<b>Reports sent: ${sent}/${candidates.length}</b>`];
      if (skipped.length > 0) summary.push("", "<pre>" + skipped.slice(0, 20).join("\n") + "</pre>");
      await sendToChat(chatId, summary.join("\n"));
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
          "No business is linked to this chat yet. Send <code>/link VND0001</code> (this business's own Vendor ID, from Settings &gt; Integrations) here first."
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
            // /report reuses the same paid "Automatic Telegram Business
            // Report" content the scheduled cron sends -- must be gated
            // by the same plan check, not just /today's free snapshot.
            if (!(await hasTelegramReportsPlan(business))) {
              await sendToChat(chatId, `<b>${business.name}</b>: full reports aren't included in your current plan. Upgrade from Plan &amp; Billing to use /report -- /today's quick snapshot is still free.`);
              continue;
            }
            const frequency = business.telegramReportFrequency && business.telegramReportFrequency !== "NONE" ? business.telegramReportFrequency : "DAILY";
            const { text: reportText } = await buildReportMessage(business.name, frequency, isSC, String(business._id), now);
            await sendToChat(chatId, reportText);
            const activityLabel = isSC ? "Workorders" : "Calls";
            const chartUrl = await buildTrendChartUrl(business.name, frequency, activityLabel, String(business._id), isSC, now);
            await sendTelegramPhoto(chartUrl, { chatId: String(chatId) });
          }
        } catch (err) {
          console.error(`[telegram-webhook] ${command} failed for business ${business._id}:`, err);
        }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[telegram-webhook] unhandled error:", err);
    if (chatIdForErrorReply) {
      await sendToChat(
        chatIdForErrorReply,
        "⚠️ Something went wrong processing that -- please try again in a moment. If it keeps failing, contact support."
      ).catch(() => {});
    }
    // Telegram retries on non-2xx -- always ack (200) so a transient
    // hiccup doesn't cause a retry storm; the error is now at least
    // logged and the sender told, instead of pure silence either way.
    return NextResponse.json({ success: true });
  }
}
