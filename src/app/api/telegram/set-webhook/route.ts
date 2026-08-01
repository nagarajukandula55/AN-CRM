/**
 * POST /api/telegram/set-webhook — Super-Admin-only, calls Telegram's own
 * setWebhook API pointed at this app's own /api/telegram/webhook, using
 * NEXT_PUBLIC_APP_URL rather than a URL typed by hand.
 *
 * STANDALONE MODE ONLY. If this app is using the central-api Telegram
 * relay (see api/telegram/webhook's top comment and central-api's README
 * section 13), Telegram's webhook should be registered on central-api
 * instead, with this site's URL set as its botWebhookUrl in central-api's
 * admin dashboard -- calling THIS route in that setup would overwrite
 * central-api's registration and break the relay for every other site
 * sharing that bot. Only use this if this app owns its own bot/webhook
 * directly, with no relay involved.
 *
 * Two reasons this exists instead of just telling an admin to hit
 * Telegram's API directly in a browser:
 *
 *  1. Typing `https://api.telegram.org/bot<TOKEN>/setWebhook?...` into a
 *     browser address bar leaves the bot token sitting in browser
 *     history/autocomplete -- doing it server-side never exposes it.
 *  2. It always uses the exact NEXT_PUBLIC_APP_URL this deployment is
 *     configured with, so there's no chance of registering the webhook
 *     against a domain that 307/308-redirects elsewhere (Telegram refuses
 *     to follow redirects on webhook delivery, so a webhook registered
 *     against a redirecting domain silently never fires -- see
 *     last_error_message in GET .../getWebhookInfo).
 *
 * GET also exposes Telegram's own getWebhookInfo passthrough so the
 * current registration (and any last_error_message) can be checked from
 * the app instead of a manual API call too.
 */
import { NextResponse } from "next/server";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET() {
  const session = await getEnrichedSession();
  if (!session?.isSuperAdmin) {
    return NextResponse.json({ success: false, error: "Super Admin only" }, { status: 403 });
  }

  const token = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ success: false, error: "ANOPS_TELEGRAM_BOT_TOKEN is not set" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await res.json();
    return NextResponse.json({ success: true, info: data?.result, relayEnabled: process.env.TELEGRAM_RELAY_ENABLED === "true" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to reach Telegram" }, { status: 502 });
  }
}

export async function POST() {
  const session = await getEnrichedSession();
  if (!session?.isSuperAdmin) {
    return NextResponse.json({ success: false, error: "Super Admin only" }, { status: 403 });
  }

  // Hard block, not just a warning -- see this file's top comment. Set
  // TELEGRAM_RELAY_ENABLED=true once this site's botWebhookUrl is
  // registered in central-api's Sites tab, so this button can't
  // accidentally overwrite that registration again.
  if (process.env.TELEGRAM_RELAY_ENABLED === "true") {
    return NextResponse.json(
      { success: false, error: "TELEGRAM_RELAY_ENABLED is set -- this site uses central-api's shared bot relay. Register the webhook from central-api, not here." },
      { status: 409 }
    );
  }

  const token = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ success: false, error: "ANOPS_TELEGRAM_BOT_TOKEN is not set" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json({ success: false, error: "NEXT_PUBLIC_APP_URL is not set" }, { status: 400 });
  }

  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const data = await res.json();
    if (!data.ok) {
      return NextResponse.json({ success: false, error: data.description || "Telegram rejected the webhook" }, { status: 502 });
    }
    return NextResponse.json({ success: true, webhookUrl, description: data.description });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to reach Telegram" }, { status: 502 });
  }
}
