/**
 * Minimal Telegram notifier -- dependency-free (plain fetch). Used for
 * ops-report/catalog-request alerts and every ecosystem-wide event
 * notification (vendor signup, agreement email, activation, etc.).
 *
 * Credentials: an explicit options.chatId always wins (a caller sending
 * to a specific business's own configured chat, a different concern from
 * the shared ops channel) -- otherwise central-api's shared "TELEGRAM"
 * integration is the source (business-specific override supported, see
 * getSharedIntegration), with the legacy ANOPS_TELEGRAM_BOT_TOKEN/
 * ANOPS_TELEGRAM_CHAT_ID env vars only as a last-resort fallback for a
 * central-api outage.
 */
import { getSharedIntegration } from "@/lib/centralApiRead";

/**
 * Same as sendTelegramMessage but returns the sent message's Telegram
 * message_id (or null on failure) instead of a bare boolean -- needed to
 * later recognize a REPLY to this specific message (see the admin-relay
 * reply flow in api/telegram/webhook).
 */
export async function sendTelegramMessageWithId(
  text: string,
  options?: { parseMode?: "HTML" | "MarkdownV2"; chatId?: string; businessId?: string }
): Promise<number | null> {
  let token = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
  let chatId = options?.chatId || process.env.ANOPS_TELEGRAM_CHAT_ID;

  if (!options?.chatId) {
    const shared = await getSharedIntegration<{ botToken?: string; chatId?: string }>("TELEGRAM", options?.businessId);
    if (shared?.botToken && shared?.chatId) {
      token = shared.botToken;
      chatId = shared.chatId;
    }
  }

  if (!token || !chatId) {
    console.warn("[telegram] No Telegram credentials configured -- skipping send.");
    return null;
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
      return null;
    }
    const data = await res.json().catch(() => null);
    return data?.result?.message_id ?? null;
  } catch (err: any) {
    console.error("[telegram] sendMessage threw:", err?.message || err);
    return null;
  }
}

export async function sendTelegramMessage(
  text: string,
  options?: { parseMode?: "HTML" | "MarkdownV2"; chatId?: string; businessId?: string }
): Promise<boolean> {
  let token = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
  let chatId = options?.chatId || process.env.ANOPS_TELEGRAM_CHAT_ID;

  if (!options?.chatId) {
    const shared = await getSharedIntegration<{ botToken?: string; chatId?: string }>("TELEGRAM", options?.businessId);
    if (shared?.botToken && shared?.chatId) {
      token = shared.botToken;
      chatId = shared.chatId;
    }
  }

  if (!token || !chatId) {
    console.warn("[telegram] No Telegram credentials configured (central-api shared integration or ANOPS_TELEGRAM_* env vars) -- skipping send.");
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
 * The single, structured format for every "a vendor was onboarded" admin
 * alert -- replaces several ad-hoc one-line messages (apply/route.ts,
 * vendorActivation.service.ts) that each showed different, incomplete
 * fields. Per explicit direction ("i want to see structured way like
 * important fields there like name, legal name, GST or No GST and
 * location like state and city and vendor code we assigned to them...
 * every message should be configured in structured way").
 */
export function formatVendorOnboardedMessage(vendor: {
  companyName?: string;
  contactPerson?: string;
  gstRegistered?: boolean;
  gstNumber?: string;
  address?: { city?: string; state?: string };
  vendorId?: string;
  appliedAs?: string;
}, opts: { status: string; requestNumber?: string; planName?: string }): string {
  const location = [vendor.address?.city, vendor.address?.state].filter(Boolean).join(", ") || "Not set";
  const gst = vendor.gstRegistered && vendor.gstNumber ? vendor.gstNumber : "Not GST registered";
  const lines = [
    `🆕 <b>Vendor Onboarded</b>`,
    ``,
    `Company: <b>${vendor.companyName || "—"}</b>`,
    `Contact Person: ${vendor.contactPerson || "—"}`,
    `GST: ${gst}`,
    `Location: ${location}`,
    `Vendor Code: <code>${vendor.vendorId || "not assigned yet"}</code>`,
    `Status: ${opts.status}`,
  ];
  if (opts.planName) lines.push(`Plan: ${opts.planName}`);
  if (opts.requestNumber) lines.push(`Request #: ${opts.requestNumber}`);
  return lines.join("\n");
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
