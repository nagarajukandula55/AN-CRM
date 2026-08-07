/**
 * Writes an entry to central-api's AI Change Log
 * (GET/POST /api/v1/an-crm-admin/change-log), visible in the AN CRM Admin
 * control panel. Best-effort: never throws, never blocks the caller --
 * a logging failure must not break the actual operation being logged.
 */
export async function logAiChange(entry: {
  summary: string;
  details?: string;
  filesChanged?: string[];
  author?: string;
  tags?: string[];
}): Promise<void> {
  const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
  const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
  if (!CENTRAL_API_URL) return;
  try {
    await fetch(`${CENTRAL_API_URL}/api/v1/an-crm-admin/change-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": CENTRAL_API_KEY || "" },
      body: JSON.stringify({
        repo: "an-crm",
        summary: entry.summary,
        details: entry.details || "",
        filesChanged: entry.filesChanged || [],
        author: entry.author || "AN-CRM Runtime",
        tags: entry.tags || [],
      }),
      cache: "no-store",
    });
  } catch {
    // best-effort only
  }
}
