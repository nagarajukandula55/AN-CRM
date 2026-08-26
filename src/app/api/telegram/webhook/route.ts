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
 * -- one bot serves every vendor, each vendor links their own chat via a
 * one-time code generated from their Profile page (QR code or deep link
 * for a personal chat, paste the code as a plain message for a group --
 * see api/vendor/telegram-link-code and the LINK_CODE_RE block below).
 * Typing a Vendor ID to link was removed -- see that block's own comment.
 *
 * VENDOR-SCOPED, NOT BUSINESS-SCOPED: the platform is now single-Business/
 * multi-vendor (every vendor's VendorProfile shares one Business), so all
 * Telegram linking/routing/reports live on VendorProfile's own telegram*
 * fields (see models/VendorProfile.ts), not Business's -- Business-level
 * fields would let only ONE vendor's chat be linked at a time platform-
 * wide, which was a real, reported bug ("My Biz Flow" showing under
 * multiple different Vendor IDs in the admin list).
 *
 * Commands:
 *   /start, /tgid  — replies with the chat id the message came from (or,
 *                    with a linking code as the argument, completes that
 *                    chat's link -- see LINK_CODE_RE below).
 *   /help          — lists every command.
 *   /profile       — this vendor's own account summary (company, status,
 *                    plan) for every vendor linked to this chat.
 *   /today         — on-demand snapshot (today vs. yesterday) for every
 *                    vendor whose Telegram Chat/Group ID matches this chat.
 *   /daily /weekly /monthly /yearly — on-demand full report of that SPECIFIC type,
 *                    regardless of the vendor's own saved default schedule.
 *   /report        — on-demand full report for every vendor linked to this
 *                    chat, using each one's own configured frequency.
 *   /runjobs       — (admin only) manually runs every due scheduled job.
 *   /sendreports   — (admin only) sends every linked vendor their own
 *                    report right now -- the actual trigger mechanism for
 *                    scheduled reports (deliberately NOT a Vercel cron,
 *                    per explicit direction).
 *   Natural language (admin only, same allowlist as /sendreports/
 *   /runjobs): "send all reports", or "send reports to <vendor name or
 *   VND code>" triggers the same thing as /sendreports, scoped to the
 *   matching vendor(s) if a name/code was given. Lets a super admin
 *   trigger this from plain conversation in their own group/DM instead of
 *   remembering the exact command.
 *
 * A chat can be linked to more than one vendor (nothing stops the same
 * Telegram chat id being linked to two vendors) -- every command that
 * looks up "the vendor(s) for this chat" loops over all matches rather
 * than assuming exactly one.
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
import VendorChatMessage from "@/models/VendorChatMessage";
import VendorSubscription from "@/models/VendorSubscription";
import { sendTelegramMessage, sendTelegramMessageWithId, sendTelegramPhoto } from "@/lib/telegram";
import { buildReportMessage, buildTrendChartUrl, periodStart, computePeriodNumbers, fmtINR, renderWorkorderBreakdown } from "@/lib/telegramReport";
import { sendVendorBusinessReport } from "@/core/telegram/sendBusinessReport";
import { runAllDueCronJobs } from "@/lib/cronRunner";
import { getAllowedModuleKeys, getActivePlanKey } from "@/core/pricing/planAccess";
import { notifyUser } from "@/services/notification.service";

// SECURITY/BILLING: "Automatic Telegram Business Report" is a paid,
// plan-gated feature (see core/pricing/plans.ts's "telegram-reports"
// moduleKey, ULTIMATE-tier only) -- checked the same way the cron job
// already does, so a Basic/Pro vendor can't get the paid feature for free
// just by messaging the bot.
async function hasTelegramReportsPlan(business: { _id: unknown; operatingMode?: string }): Promise<boolean> {
  const mode = (business.operatingMode || "SC") as "SC";
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
  "Not linked yet? Generate a QR code/link from your Profile page (Telegram Alerts) and scan it -- that links this chat instantly and securely. Typing a Vendor ID here is no longer supported.",
  "/tgid — show this chat's Telegram ID",
  "/profile — your vendor account summary (company, status, plan)",
  "/today — quick revenue &amp; activity snapshot, today vs. yesterday",
  "/daily — full daily report, on demand",
  "/weekly — full weekly report, on demand",
  "/monthly — full monthly report, on demand",
  "/yearly — full yearly report, on demand",
  "/report — full report using your saved default schedule",
  "/runjobs — (admin only) manually run every due scheduled job now",
  "/sendreports — (admin only) send every linked vendor their own business report right now",
  "/help — this list",
].join("\n");

// Natural-language admin trigger, e.g. "send all reports" or "send
// reports to My Biz Flow" / "send reports to VND0004" -- group 2 (if
// present) is the target vendor name/code to filter to; absent means
// every linked vendor. Deliberately loose (case-insensitive, optional
// "all"/"to") since this is meant to work as plain conversation, not a
// strict command syntax.
const NL_SEND_REPORTS_RE = /^send\s+(all\s+)?reports?(?:\s+to\s+(.+))?\s*$/i;

async function sendToChat(chatId: number | string, text: string) {
  await sendTelegramMessage(text, { chatId: String(chatId), parseMode: "HTML" });
}

// A linking code minted by POST /api/vendor/telegram-link-code -- 6
// characters from an alphabet that excludes visually-ambiguous characters
// (0/O, 1/I/L), matching that route's CODE_ALPHABET.
const LINK_CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/i;

// Shared by both linking paths (typed Vendor ID, and the newer QR/deep-
// link code) -- links this chat (group or personal, detected from the
// message itself) to `vendor`, turns on default daily reports if the
// plan allows it, and sends the confirmation + first report. `label` is
// just what the confirmation message calls the thing that was matched
// ("Vendor ID VND0001" vs "code"), so the two paths read naturally.
async function finishLinking(chatId: number | string, message: any, vendor: any, label: string) {
  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
  const business = vendor.businessId ? await Business.findById(vendor.businessId).select("name operatingMode").lean<any>() : null;
  if (!business) {
    await sendToChat(chatId, `This vendor has no active business on file yet. Contact support.`);
    return;
  }

  if (isGroup) {
    vendor.telegramChatId = String(chatId);
  } else {
    vendor.telegramPersonalChatId = String(chatId);
  }
  const reportsAllowed = await hasTelegramReportsPlan(business);
  if (reportsAllowed && (!vendor.telegramReportFrequency || vendor.telegramReportFrequency === "NONE")) {
    vendor.telegramReportFrequency = "DAILY";
  }
  await vendor.save();

  const greetName = vendor.companyName || business.name;
  await sendToChat(
    chatId,
    reportsAllowed
      ? `👋 Hi <b>${greetName}</b>! Confirmed -- ${label} is now linked, and this ${isGroup ? "group" : "personal chat"} will receive ${isGroup ? "team" : "your own"} automated reports (daily by default — change the schedule any time in Settings).\n\nSending your first report now…`
      : `👋 Hi <b>${greetName}</b>! Confirmed -- ${label} is now linked, and this ${isGroup ? "group" : "personal chat"} can receive alerts, but automatic scheduled reports aren't included in your current plan. Upgrade from Plan &amp; Billing to turn those on.`
  );

  if (!reportsAllowed) return;

  try {
    const isSC = (business.operatingMode || "SC") === "SC";
    const { text: reportText } = await buildReportMessage(greetName, vendor.telegramReportFrequency || "DAILY", isSC, String(business._id), new Date(), String(vendor._id), greetName);
    await sendToChat(chatId, reportText);
  } catch (err) {
    console.error("[telegram-webhook] finishLinking first-report failed:", err);
  }
}

async function runSendReports(chatId: number | string, targetQuery?: string) {
  await connectDB();
  const filter: Record<string, unknown> = {
    $or: [{ telegramChatId: { $nin: [null, ""] } }, { telegramPersonalChatId: { $nin: [null, ""] } }],
    isDeleted: { $ne: true },
  };
  const candidates = await VendorProfile.find(filter).select("vendorId companyName telegramChatId telegramPersonalChatId");

  let targeted = candidates;
  let targetLabel = "";
  if (targetQuery?.trim()) {
    const q = targetQuery.trim();
    const qLower = q.toLowerCase();
    targeted = candidates.filter(
      (v) => v.vendorId?.toLowerCase() === qLower || (v.companyName || "").toLowerCase().includes(qLower)
    );
    targetLabel = ` matching "${q}"`;
    if (targeted.length === 0) {
      await sendToChat(chatId, `No linked vendor found${targetLabel}. Check the name/Vendor ID and try again, or use /sendreports for everyone.`);
      return;
    }
  }

  await sendToChat(chatId, `Sending reports to ${targeted.length} linked vendor(s)${targetLabel}…`);
  let sent = 0;
  const skipped: string[] = [];
  for (const vendor of targeted) {
    try {
      const result = await sendVendorBusinessReport(String(vendor._id));
      if (result.sent) sent++;
      else skipped.push(`${vendor.companyName || vendor.vendorId} (${result.reason})`);
    } catch (err) {
      console.error(`[telegram-webhook] sendreports failed for vendor ${vendor._id}:`, err);
      skipped.push(`${vendor.companyName || vendor.vendorId} (error)`);
    }
  }
  const summary = [`<b>Reports sent: ${sent}/${targeted.length}</b>`];
  if (skipped.length > 0) summary.push("", "<pre>" + skipped.slice(0, 20).join("\n") + "</pre>");
  await sendToChat(chatId, summary.join("\n"));
}

export async function POST(req: NextRequest) {
  // Hoisted so the catch-all below can still reply to whichever chat sent
  // the message, even if the exception happened after we parsed it.
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

    // Admin-relay reply: an admin (chat id in ANOPS_TELEGRAM_ADMIN_CHAT_IDS)
    // hit "Reply" in their own Telegram app on a message this webhook
    // forwarded from a vendor (see the inbound-message handler further
    // below) -- relay the reply text straight back to that vendor's
    // personal chat, no console visit required. Checked before any
    // command/linking logic since a reply's text is arbitrary and must
    // never be mistaken for a linking code or command.
    const replyToId = message.reply_to_message?.message_id;
    if (isAdminChat(chatId) && replyToId) {
      const relayKey = `${chatId}:${replyToId}`;
      const original = await VendorChatMessage.findOne({ adminRelayMessageIds: relayKey });
      if (original) {
        const relayVendor = await VendorProfile.findById(original.vendorId).select("telegramPersonalChatId businessId");
        if (!relayVendor?.telegramPersonalChatId) {
          await sendToChat(chatId, "⚠️ This vendor's personal chat is no longer linked -- can't deliver.");
        } else {
          const delivered = await sendTelegramMessage(text, { chatId: String(relayVendor.telegramPersonalChatId) });
          if (delivered) {
            await VendorChatMessage.create({
              vendorId: original.vendorId,
              businessId: relayVendor.businessId,
              direction: "outbound",
              text,
              isRead: true,
            });
            await sendToChat(chatId, "✅ Sent.");
          } else {
            await sendToChat(chatId, "⚠️ Failed to deliver to the vendor.");
          }
        }
        return NextResponse.json({ success: true });
      }
      // Not a reply to a relayed vendor message -- an admin replying to
      // something else in their own chat, falls through to normal handling.
    }

    // In a group/supergroup, Telegram appends "@YourBotUsername" to every
    // command (e.g. "/link@MyBizFlowBot ABC123") -- strip the "@..."
    // suffix before comparing.
    const command = text.trim().split(/\s+/)[0].toLowerCase().replace(/@\S+$/, "");

    await connectDB();

    // ONLY supported linking path: a one-time code generated from the
    // vendor's own Profile page (QR code / deep link, or typed/pasted
    // manually into a group) -- see api/vendor/telegram-link-code. The
    // old typed-Vendor-ID path was removed entirely, see the comment
    // further below for why.
    if (command === "/start" || LINK_CODE_RE.test(text.trim())) {
      const arg = (command === "/start" ? text.trim().split(/\s+/)[1] : text.trim())?.trim().toUpperCase();
      if (arg && LINK_CODE_RE.test(arg)) {
        const vendor = await VendorProfile.findOne({
          telegramLinkCode: arg,
          telegramLinkCodeExpiresAt: { $gt: new Date() },
          isDeleted: { $ne: true },
        });
        if (!vendor) {
          await sendToChat(chatId, "This code has expired or was already used. Generate a fresh one from your Profile page and try again.");
          return NextResponse.json({ success: true });
        }
        // Single-use: cleared before doing anything else, so a retried/
        // duplicated webhook delivery can't link the same code twice.
        vendor.telegramLinkCode = undefined;
        vendor.telegramLinkCodeExpiresAt = undefined;
        await finishLinking(chatId, message, vendor, "your account");
        return NextResponse.json({ success: true });
      }
      if (command === "/start") {
        // A bare /start with no payload (someone opened the bot directly,
        // not via a deep link) -- falls through to the /tgid|start greeting
        // handler below instead of erroring here.
      } else {
        return NextResponse.json({ success: true });
      }
    }

    // The bare-Vendor-ID / "/link VND0001" linking path was removed per
    // explicit direction and for a real security reason: a Vendor ID is
    // visible all over the app (not a secret), so anyone who knew/guessed
    // one could link their own chat to receive another vendor's reports.
    // The one-time-code system (LINK_CODE_RE block above, generated from
    // the vendor's own Profile page as a QR/deep link) is the only
    // supported way to link a chat now, for both personal (deep link) and
    // group (paste the code as a plain message) chats.

    if (/^\/(tgid|start)\b/i.test(command)) {
      const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
      const reply = isGroup
        ? `This group's Telegram ID is:\n<code>${chatId}</code>\n\nTo link it, generate a code from your Profile page (Telegram Alerts) and send that code here as a plain message.`
        : `Your Telegram ID is:\n<code>${chatId}</code>\n\nTo link it, generate a QR code/link from your Profile page (Telegram Alerts) and scan/tap it -- links instantly.`;
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
    // A platform admin sends this (or its natural-language equivalent,
    // below) from an allowlisted chat and every vendor with a linked chat
    // gets their own report sent to their own configured chat(s) right
    // now, scoped to their own data only.
    if (command === "/sendreports") {
      if (!isAdminChat(chatId)) {
        await sendToChat(chatId, "This command is restricted to platform admins.");
        return NextResponse.json({ success: true });
      }
      await runSendReports(chatId);
      return NextResponse.json({ success: true });
    }

    // Natural-language equivalent of /sendreports -- ONLY from an
    // allowlisted admin chat (same ANOPS_TELEGRAM_ADMIN_CHAT_IDS as
    // /sendreports/runjobs), per explicit direction ("this can be done
    // through my super admin group or bot inbox... only from my super
    // admin telegram chat ID only"). Checked AFTER every real command so
    // it can never shadow one, and only even attempted for an admin chat
    // so a vendor's own group chatting normally never accidentally
    // triggers a bulk send.
    if (isAdminChat(chatId) && !text.trim().startsWith("/")) {
      const nlMatch = text.trim().match(NL_SEND_REPORTS_RE);
      if (nlMatch) {
        await runSendReports(chatId, nlMatch[2]);
        return NextResponse.json({ success: true });
      }
    }

    // /report used to always use each vendor's own SAVED default schedule
    // regardless of what was actually asked for -- /daily, /weekly,
    // /monthly now let anyone request a SPECIFIC report type on demand,
    // per explicit direction ("different commands required and if they
    // send accordingly reports should be triggered"). /report still
    // exists too, as a shorthand for "give me my usual one".
    const EXPLICIT_FREQUENCY: Record<string, string> = { "/daily": "DAILY", "/weekly": "WEEKLY", "/monthly": "MONTHLY", "/yearly": "YEARLY" };
    if (command === "/today" || command === "/report" || command in EXPLICIT_FREQUENCY) {
      // Matches either the group chat id OR the personal chat id -- a
      // vendor asking from their own personal DM (Settings supports
      // configuring separately) should still get "not linked" only if
      // neither is actually set.
      const vendors = await VendorProfile.find({
        $or: [{ telegramChatId: String(chatId) }, { telegramPersonalChatId: String(chatId) }],
        isDeleted: { $ne: true },
      }).select("vendorId companyName businessId telegramReportFrequency");

      if (vendors.length === 0) {
        await sendToChat(
          chatId,
          "No vendor is linked to this chat yet. Generate a code from your Profile page (Telegram Alerts) and send it here first."
        );
        return NextResponse.json({ success: true });
      }

      const now = new Date();
      for (const vendor of vendors) {
        if (!vendor.businessId) continue;
        const business = await Business.findById(vendor.businessId).select("name operatingMode").lean<any>();
        if (!business) continue;
        const isSC = (business.operatingMode || "SC") === "SC";
        const displayName = vendor.companyName || business.name;
        try {
          if (command === "/today") {
            const from = periodStart("DAILY", now);
            const [current, prior] = await Promise.all([
              computePeriodNumbers(String(business._id), isSC, from, now, String(vendor._id)),
              computePeriodNumbers(String(business._id), isSC, periodStart("DAILY", from), from, String(vendor._id)),
            ]);
            const activityLabel = isSC ? "Workorders" : "Calls";
            const statusBreakdown = renderWorkorderBreakdown(current.byStatus, activityLabel);
            const msgLines = [
              `<b>${displayName} — Today</b>`,
              "",
              "<pre>",
              `Revenue      ${fmtINR(current.revenue).padEnd(14)} (yesterday ${fmtINR(prior.revenue)})`,
              `Invoices     ${String(current.invoices).padEnd(14)} (yesterday ${prior.invoices})`,
              `${activityLabel.padEnd(12)} ${String(current.activity).padEnd(14)} (yesterday ${prior.activity})`,
              "</pre>",
            ];
            if (statusBreakdown) msgLines.push("", statusBreakdown);
            await sendToChat(chatId, msgLines.join("\n"));
          } else {
            // /report and /daily|/weekly|/monthly all reuse the same paid
            // "Automatic Telegram Business Report" content the scheduled
            // trigger sends -- must be gated by the same plan check, not
            // just /today's free snapshot.
            if (!(await hasTelegramReportsPlan(business))) {
              await sendToChat(chatId, `<b>${displayName}</b>: full reports aren't included in your current plan. Upgrade from Plan &amp; Billing to use ${command} -- /today's quick snapshot is still free.`);
              continue;
            }
            const frequency =
              EXPLICIT_FREQUENCY[command] ||
              (vendor.telegramReportFrequency && vendor.telegramReportFrequency !== "NONE" ? vendor.telegramReportFrequency : "DAILY");
            const { text: reportText } = await buildReportMessage(displayName, frequency, isSC, String(business._id), now, String(vendor._id), displayName);
            await sendToChat(chatId, reportText);
            const activityLabel = isSC ? "Workorders" : "Calls";
            const chartUrl = await buildTrendChartUrl(displayName, frequency, activityLabel, String(business._id), isSC, now, String(vendor._id));
            await sendTelegramPhoto(chartUrl, { chatId: String(chatId) });
          }
        } catch (err) {
          console.error(`[telegram-webhook] ${command} failed for vendor ${vendor._id}:`, err);
        }
      }
      return NextResponse.json({ success: true });
    }

    // /profile -- vendor's own account summary, on demand. Per explicit
    // direction ("give option to check vendor's own profile as well with
    // command"). Same chat-to-vendor(s) resolution as /today|/report.
    if (command === "/profile") {
      const vendors = await VendorProfile.find({
        $or: [{ telegramChatId: String(chatId) }, { telegramPersonalChatId: String(chatId) }],
        isDeleted: { $ne: true },
      }).select("vendorId companyName contactPerson email phone status isApproved businessId");

      if (vendors.length === 0) {
        await sendToChat(
          chatId,
          "No vendor is linked to this chat yet. Generate a code from your Profile page (Telegram Alerts) and send it here first."
        );
        return NextResponse.json({ success: true });
      }

      for (const vendor of vendors) {
        const sub = vendor.businessId
          ? await VendorSubscription.findOne({ vendorId: vendor._id }).select("planName currentPeriodEnd").lean<any>()
          : null;
        const planLine = sub?.planName
          ? `${sub.planName} — valid until ${new Date(sub.currentPeriodEnd).toLocaleDateString("en-IN")}`
          : "No active plan";
        const lines = [
          `<b>${vendor.companyName || "Vendor"}</b>`,
          "",
          "<pre>",
          `Vendor ID    ${vendor.vendorId || "—"}`,
          `Contact      ${vendor.contactPerson || "—"}`,
          `Email        ${vendor.email || "—"}`,
          `Phone        ${vendor.phone || "—"}`,
          `Status       ${vendor.status || "—"}${vendor.isApproved ? "" : " (pending approval)"}`,
          `Plan         ${planLine}`,
          "</pre>",
        ];
        await sendToChat(chatId, lines.join("\n"));
      }
      return NextResponse.json({ success: true });
    }

    // Inbuilt vendor chat -- a plain-text reply (not a command, not a
    // linking code/Vendor ID, already ruled out above) arriving in a
    // PRIVATE chat gets stored as an inbound message on that vendor's
    // support chat (see api/vendor/chat), so a reply the vendor's own
    // Telegram app receives from a human on the other end shows up inside
    // the portal's chat panel too. Personal-chat-only, deliberately --
    // see VendorChatMessage's own comment for why a group chat (which CAN
    // legitimately be linked to more than one vendor) isn't a safe
    // isolation boundary for this, but a personal chat always is.
    const isGroupChat = message.chat.type === "group" || message.chat.type === "supergroup";
    if (!isGroupChat && !text.trim().startsWith("/")) {
      const chatVendor = await VendorProfile.findOne({
        telegramPersonalChatId: String(chatId),
        isDeleted: { $ne: true },
      }).select("_id businessId userId");
      if (chatVendor) {
        // Forward a tagged copy into every admin chat (ANOPS_TELEGRAM_
        // ADMIN_CHAT_IDS) so a human can reply from their own Telegram app
        // -- see the admin-relay-reply block near the top of this handler.
        // Best-effort: no admin chats configured, or a send failing, just
        // means no forward happened; the message is still fully visible
        // in the console inbox (api/admin/vendor-chats) regardless.
        const vendorForTag = await VendorProfile.findById(chatVendor._id).select("companyName vendorId").lean<any>();
        const adminChatIds = (process.env.ANOPS_TELEGRAM_ADMIN_CHAT_IDS || "")
          .split(",").map((s) => s.trim()).filter(Boolean);
        const tag = `💬 <b>${vendorForTag?.companyName || "Vendor"}</b>${vendorForTag?.vendorId ? ` (${vendorForTag.vendorId})` : ""}\n${text.trim()}\n\n<i>Reply to this message to answer them directly.</i>`;
        const relayIds: string[] = [];
        for (const adminChatId of adminChatIds) {
          const relayedMessageId = await sendTelegramMessageWithId(tag, { chatId: adminChatId });
          if (relayedMessageId) relayIds.push(`${adminChatId}:${relayedMessageId}`);
        }

        await VendorChatMessage.create({
          vendorId: chatVendor._id,
          businessId: chatVendor.businessId,
          direction: "inbound",
          text: text.trim(),
          telegramMessageId: message.message_id ? String(message.message_id) : "",
          adminRelayMessageIds: relayIds,
        });
        if (chatVendor.userId) {
          notifyUser({
            userId: String(chatVendor.userId),
            businessId: String(chatVendor.businessId),
            title: "New message",
            message: text.trim().slice(0, 140),
            type: "info",
            link: "/vendor/telegram",
          }).catch(() => {});
        }
      }
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
