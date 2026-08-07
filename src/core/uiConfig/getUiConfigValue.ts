/**
 * Reads one entry from central-api's UI Config store (AN CRM Admin ->
 * UI Config tab -- dropdown options, form sizing, icon overrides,
 * animation choices). Same live-with-local-fallback pattern as
 * getVendorTelegramMessageTypes(): a missing/disabled/unreachable entry
 * just falls back to whatever the caller already had hardcoded, so this
 * app never depends on central-api being up.
 */
export async function getUiConfigValue<T>(type: string, key: string, fallback: T): Promise<T> {
  const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
  const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
  if (!CENTRAL_API_URL) return fallback;
  try {
    const res = await fetch(
      `${CENTRAL_API_URL}/api/v1/an-crm-admin/ui-config/one?app=an-crm&type=${encodeURIComponent(type)}&key=${encodeURIComponent(key)}`,
      { headers: { "x-api-key": CENTRAL_API_KEY || "" }, cache: "no-store" }
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    if (!data?.entry || data.entry.enabled === false || data.entry.value === undefined) return fallback;
    return data.entry.value as T;
  } catch {
    return fallback;
  }
}
