/**
 * GET /api/auth/telegram/bot-username — PUBLIC. Resolves the bot's own
 * @username so the login page can render the official Telegram Login
 * Widget (which needs data-telegram-login=<username>) for an anonymous
 * visitor -- api/telegram/bot-info is the same lookup but gated behind a
 * session, which is exactly wrong for this one caller: nobody has a
 * session yet on the login page. Not sensitive (a bot's @username is
 * already public on Telegram itself), so a separate public route is
 * simpler and safer than loosening the authenticated one's gate.
 */
import { NextResponse } from "next/server";

let cachedUsername: string | null | undefined;

export async function GET() {
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
