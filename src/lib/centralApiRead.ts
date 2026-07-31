/**
 * Phase B of the Business/Vendor migration to central-api: READS for a
 * small, deliberately-scoped set of read-only, non-auth, non-transactional
 * endpoints (see src/lib/centralApiSync.ts for the Phase A dual-write that
 * populates these datasets). Auth-critical paths (session resolution,
 * login, business-switching) and write-heavy/transactional flows (vendor
 * approval, invoicing, document numbering) are intentionally NOT migrated
 * yet — those need a later, more careful phase.
 *
 * central-api's generic dataset API only supports single-field exact/
 * substring string matching (?search=field:value) — no $in, no boolean-
 * aware comparison (a boolean field compared against the string "true"
 * never matches), no population, no aggregation. Every helper here
 * therefore fetches the broader result set and does the real filtering in
 * application code, the same pattern already used for
 * src/lib/centralApiPincode.ts's tree endpoint.
 *
 * Every record synced by centralApiSync.ts carries `sourceId` — the
 * originating app's own Mongo _id — since central-api mints its own _id on
 * insert. Every helper here remaps `sourceId` back onto `_id` in its
 * return value, so callers written against the old Mongoose shape
 * (`business._id`, `String(business._id)`, ...) don't need to change.
 */

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
const PAGE_SIZE = 2000; // central-api's per-request cap

function headers(): HeadersInit {
  return { "x-api-key": CENTRAL_API_KEY || "" };
}

function remapId(item: Record<string, any>): Record<string, any> {
  const { sourceId, _id, ...rest } = item;
  return { _id: sourceId || _id, ...rest };
}

async function fetchAll(dataset: string): Promise<Record<string, any>[]> {
  if (!CENTRAL_API_URL) throw new Error("CENTRAL_API_URL is not configured");

  const items: Record<string, any>[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${CENTRAL_API_URL}/api/v1/${dataset}?page=${page}&limit=${PAGE_SIZE}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`central-api ${dataset} fetch failed (${res.status})`);
    const body = await res.json();
    items.push(...(body.items || []));
    if (!body.items || body.items.length < PAGE_SIZE || page >= (body.totalPages || 1)) break;
    page += 1;
  }
  return items.map(remapId);
}

export async function listBusinesses(): Promise<Record<string, any>[]> {
  return fetchAll("businesses");
}

export async function listVendors(): Promise<Record<string, any>[]> {
  return fetchAll("vendors");
}

async function findOne(dataset: string, field: string, value: string): Promise<Record<string, any> | null> {
  if (!CENTRAL_API_URL) throw new Error("CENTRAL_API_URL is not configured");
  const res = await fetch(
    `${CENTRAL_API_URL}/api/v1/${dataset}?search=${encodeURIComponent(`${field}:${value}`)}&limit=1`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`central-api ${dataset} lookup failed (${res.status})`);
  const body = await res.json();
  const item = body.items && body.items[0];
  return item ? remapId(item) : null;
}

export async function getBusinessBySourceId(sourceId: string): Promise<Record<string, any> | null> {
  return findOne("businesses", "sourceId", sourceId);
}

export async function getVendorBySourceId(sourceId: string): Promise<Record<string, any> | null> {
  return findOne("vendors", "sourceId", sourceId);
}

// vendorId here is the human-facing vendor code (e.g. "NAT-VND-0001"), a
// genuine string field — unlike sourceId-based lookups this is a clean
// single-field exact match, no client-side filtering workaround needed.
export async function getVendorByVendorCode(vendorCode: string): Promise<Record<string, any> | null> {
  return findOne("vendors", "vendorId", vendorCode);
}
