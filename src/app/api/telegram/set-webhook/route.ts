/**
 * POST /api/telegram/set-webhook — Super-Admin-only, calls Telegram's own
 * setWebhook API pointed at this app's own /api/telegram/webhook, using
 * NEXT_PUBLIC_APP_URL rather than a URL typed by hand. Two reasons this
 * exists instead of just telling an admin to hit Telegram's API directly
 * in a browser:
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
    return NextResponse.json({ success: true, info: data?.result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to reach Telegram" }, { status: 502 });
  }
}

export async function POST() {
  const session = await getEnrichedSession();
  if (!session?.isSuperAdmin) {
    return NextResponse.json({ success: false, error: "Super Admin only" }, { status: 403 });
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
