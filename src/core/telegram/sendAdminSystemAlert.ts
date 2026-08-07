/**
 * Fires a real internal system alert through central-api's multi-bot
 * Telegram system (AN CRM Admin -> Telegram Integration), NOT the
 * per-vendor Telegram routing elsewhere in this app -- this is for AN
 * Group's own ops/admin chats, keyed by an activityKey an admin assigns
 * to one or more bot+chat pairs from that panel. Best-effort: never
 * throws, never blocks the caller -- no assignment configured yet for a
 * given key is expected (returns 404 from central-api), not an error.
 */
export async function sendAdminSystemAlert(activityKey: string, text: string): Promise<void> {
  const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
  const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
  if (!CENTRAL_API_URL) return;
  try {
    await fetch(`${CENTRAL_API_URL}/api/v1/telegram-bots/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": CENTRAL_API_KEY || "" },
      body: JSON.stringify({ activityKey: activityKey.toUpperCase(), text }),
      cache: "no-store",
    });
  } catch {
    // best-effort only
  }
}
