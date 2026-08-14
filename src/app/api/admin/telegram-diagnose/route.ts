/**
 * POST /api/admin/telegram-diagnose — super-admin-only. Isolates WHERE a
 * "bot isn't responding" report actually breaks when this site runs
 * behind central-api's Telegram relay (see api/telegram/webhook's top
 * comment): Telegram -> central-api -> (relay, HTTP call carrying
 * x-api-key) -> this site's own /api/telegram/webhook.
 * GET /api/telegram/set-webhook's getWebhookInfo can only ever confirm
 * the FIRST hop (Telegram <-> central-api) -- it has no visibility into
 * whether central-api's relay is actually configured to forward to this
 * site, or whether this site's CENTRAL_API_KEY matches what central-api
 * sends.
 *
 * This route skips Telegram and central-api entirely and calls this
 * site's OWN /api/telegram/webhook directly, self-authenticated with this
 * site's own CENTRAL_API_KEY env var (exactly what a correctly-configured
 * central-api relay would send) with a synthetic /help update addressed
 * to the first configured admin chat id. If that admin chat actually
 * receives the /help reply in Telegram, this site's own webhook handling
 * + auth + send path all work correctly end-to-end -- meaning a "bot
 * isn't responding" symptom is isolated to central-api's own relay
 * configuration (its Sites tab botWebhookUrl for this site), which lives
 * outside this codebase and can't be fixed or inspected from here.
 */
import { NextRequest, NextResponse } from "next/server";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function POST(req: NextRequest) {
  const session = await getEnrichedSession();
  if (!session?.isSuperAdmin) {
    return NextResponse.json({ success: false, error: "Super Admin only" }, { status: 403 });
  }

  const adminChatIds = (process.env.ANOPS_TELEGRAM_ADMIN_CHAT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminChatIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "ANOPS_TELEGRAM_ADMIN_CHAT_IDS isn't set -- add your own Telegram chat id there first (comma-separated if more than one) so this test has somewhere to send a reply." },
      { status: 400 }
    );
  }
  const testChatId = Number(adminChatIds[0]) || adminChatIds[0];

  const centralApiKey = process.env.CENTRAL_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("host") || ""}`;
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(centralApiKey ? { "x-api-key": centralApiKey } : {}),
      },
      body: JSON.stringify({
        message: {
          message_id: 0,
          date: Math.floor(Date.now() / 1000),
          chat: { id: testChatId, type: "private" },
          text: "/help",
        },
      }),
    });
    const ok = res.ok;
    return NextResponse.json({
      success: ok,
      webhookUrl,
      testedChatId: testChatId,
      usedCentralApiKey: !!centralApiKey,
      status: res.status,
      message: ok
        ? `Sent -- check chat ${testChatId} in Telegram for a /help reply. If it arrives, this site's own webhook + send path work correctly and the issue is central-api's relay configuration (its Sites tab), not this codebase.`
        : `This site's own webhook rejected the call (HTTP ${res.status}) -- check CENTRAL_API_KEY matches on both sides, and that ANOPS_TELEGRAM_BOT_TOKEN is set on this deployment.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to reach this site's own webhook route" }, { status: 502 });
  }
}
