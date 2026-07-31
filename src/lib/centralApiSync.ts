/**
 * Phase A of the Business/Vendor migration to central-api: DUAL-WRITE ONLY.
 *
 * angroup's own MongoDB remains the sole source of truth for reads — this
 * module never changes what any existing query returns. It only pushes a
 * best-effort copy of every Business/VendorProfile create/update into
 * central-api's shared "businesses"/"vendors" datasets, so other AN group
 * properties (an-crm, native, an-technologies, ...) have a live, shared
 * registry to read from going forward, without touching angroup's
 * auth-critical read paths (getEnrichedSession() and friends) yet.
 *
 * A later phase migrates reads (then writes) off local Mongo entirely and
 * removes this file along with the local models — see
 * ANGROUP_INTEGRATION_STATUS.md for the phase plan.
 *
 * central-api has no upsert-by-arbitrary-field endpoint (PUT only updates
 * by central-api's own _id, POST only inserts) — so "does this document
 * already exist in central-api" is answered by searching on `sourceId`
 * (this app's own Mongo _id, stamped onto every synced document), then
 * PUTing to the matched central-api _id or POSTing a new one.
 *
 * Never throws — a central-api outage or misconfiguration must never fail
 * the local save that triggered the sync.
 */

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;

function headers(): HeadersInit {
  return { "x-api-key": CENTRAL_API_KEY || "", "Content-Type": "application/json" };
}

// Mongoose documents contain ObjectIds/Dates/etc. that don't survive
// JSON.stringify cleanly for a plain HTTP API — round-tripping through
// JSON first normalizes everything to plain strings, same as what actually
// goes over the wire.
function toPlainJson(doc: any): Record<string, any> {
  return JSON.parse(JSON.stringify(doc));
}

export async function syncRecordToCentralApi(dataset: string, sourceId: string, doc: any): Promise<void> {
  if (!CENTRAL_API_URL) return; // not configured — sync silently disabled, local save unaffected

  try {
    const payload = toPlainJson(doc);
    delete payload._id; // central-api mints its own _id; sourceId is the join key back to this app's record
    payload.sourceId = sourceId;

    const findRes = await fetch(
      `${CENTRAL_API_URL}/api/v1/${dataset}?search=${encodeURIComponent(`sourceId:${sourceId}`)}&limit=1`,
      { headers: headers(), cache: "no-store" }
    );
    const findBody = findRes.ok ? await findRes.json().catch(() => null) : null;
    const existing = findBody?.items?.[0];

    if (existing?._id) {
      await fetch(`${CENTRAL_API_URL}/api/v1/${dataset}/${existing._id}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`${CENTRAL_API_URL}/api/v1/${dataset}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
      });
    }
  } catch (err) {
    // Best-effort only. Log for visibility (surfaces in Vercel logs) but
    // never propagate — this must not turn a central-api hiccup into a
    // failed Business/Vendor save.
    console.error(`[centralApiSync] failed to sync ${dataset}/${sourceId}:`, (err as any)?.message || err);
  }
}

export async function deleteRecordFromCentralApi(dataset: string, sourceId: string): Promise<void> {
  if (!CENTRAL_API_URL) return;
  try {
    await fetch(
      `${CENTRAL_API_URL}/api/v1/${dataset}?search=${encodeURIComponent(`sourceId:${sourceId}`)}`,
      { method: "DELETE", headers: headers() }
    );
  } catch (err) {
    console.error(`[centralApiSync] failed to delete ${dataset}/${sourceId}:`, (err as any)?.message || err);
  }
}
