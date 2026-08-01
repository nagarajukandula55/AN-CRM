/**
 * GET /api/telegram/bot-info — resolves the bot's own @username via
 * Telegram's getMe so the "Connect to Telegram" button in Settings can
 * deep-link straight to https://t.me/<username> without needing a second,
 * easy-to-drift env var alongside ANOPS_TELEGRAM_BOT_TOKEN (the token
 * already IS the bot; asking for its username again separately is the
 * exact kind of config duplication that goes stale).
 *
 * In-memory cache for the process lifetime — the bot's username never
 * changes at runtime, so there's no reason to hit Telegram on every page
 * load.
 */
import { NextResponse } from "next/server";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

let cachedUsername: string | null | undefined;

export async function GET() {
  const session = await getEnrichedSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.ANOPS_TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ success: true, configured: false, username: null });
  }

  if (cachedUsername !== undefined) {
    return NextResponse.json({ success: true, configured: true, username: cachedUsername });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    cachedUsername = data?.ok ? data.result?.username ?? null : null;
    return NextResponse.json({ success: true, configured: true, username: cachedUsername });
  } catch {
    return NextResponse.json({ success: true, configured: true, username: null });
  }
}
