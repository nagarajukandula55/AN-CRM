/**
 * GET /api/telegram/users — Super-Admin-only listing of every chat
 * (personal or group) that has ever messaged the bot, read from
 * central-api's "telegram_users" dataset -- central-api now records this
 * directly (it sees every update before relaying it anywhere), so this
 * app no longer keeps its own local copy/dual-write of the same data (see
 * central-api's app.js recordTelegramContact() and README section 13).
 *
 * Unlike the old local table, this has no linkedBusinessIds -- central-api
 * has no visibility into which business a chat is linked to (that link
 * only exists in this app's own Business.telegramChatId), so the admin
 * page just shows the raw chat identity/activity now.
 */
import { NextResponse } from "next/server";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET() {
  const session = await getEnrichedSession();
  if (!session?.isSuperAdmin) {
    return NextResponse.json({ success: false, error: "Super Admin only" }, { status: 403 });
  }

  const centralApiUrl = process.env.CENTRAL_API_URL;
  const centralApiKey = process.env.CENTRAL_API_KEY;
  if (!centralApiUrl || !centralApiKey) {
    return NextResponse.json({ success: false, error: "CENTRAL_API_URL/CENTRAL_API_KEY are not configured" }, { status: 400 });
  }

  try {
    const res = await fetch(`${centralApiUrl.replace(/\/$/, "")}/api/v1/telegram_users?limit=500`, {
      headers: { "x-api-key": centralApiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json({ success: false, error: `central-api returned ${res.status}: ${body}` }, { status: 502 });
    }
    const data = await res.json();
    const users = (data.items || []).sort(
      (a: any, b: any) => new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime()
    );
    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to reach central-api" }, { status: 502 });
  }
}
