/**
 * Shared central-api pincode helpers, used by:
 *  - /api/admin/pincode-tree (state/city/pincode picker for vendor coverage)
 *  - /api/appointment-requests (enriches a submitted pincode with state/city
 *    to match vendor CITY/STATE-level coverage)
 * Both used to query the local PincodeEntry MongoDB collection directly;
 * pincode data now lives in central-api's shared "pincode" dataset instead
 * (see src/app/api/pincode/[pincode]/route.ts's comment for the migration).
 *
 * central-api's generic dataset API has no aggregation/distinct endpoint,
 * so the tree picker needs the full ~19,500-row dataset to compute distinct
 * states/cities/pincodes itself. Fetched once and cached in memory rather
 * than re-fetched on every admin page load, since India's pincode
 * directory changes rarely.
 */

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
const PAGE_SIZE = 2000; // central-api's per-request cap
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export type PincodeEntryData = {
  pincode: string;
  state: string;
  district?: string;
  city: string;
};

let cache: { entries: PincodeEntryData[]; fetchedAt: number } | null = null;

function requireCentralApiUrl() {
  if (!CENTRAL_API_URL) throw new Error("CENTRAL_API_URL is not configured");
  return CENTRAL_API_URL;
}

export async function getAllPincodeEntries(): Promise<PincodeEntryData[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.entries;
  }

  const baseUrl = requireCentralApiUrl();
  const entries: PincodeEntryData[] = [];
  let page = 1;

  // Paginate through the whole dataset once - central-api caps each page at
  // 2000 rows, and the full India pincode directory is ~19,500 rows.
  while (true) {
    const res = await fetch(
      `${baseUrl}/api/v1/pincode?page=${page}&limit=${PAGE_SIZE}`,
      { headers: { "x-api-key": CENTRAL_API_KEY || "" }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`central-api pincode fetch failed (${res.status})`);
    const body = await res.json();
    entries.push(...(body.items || []));
    if (!body.items || body.items.length < PAGE_SIZE || page >= (body.totalPages || 1)) break;
    page += 1;
  }

  cache = { entries, fetchedAt: Date.now() };
  return entries;
}

export async function lookupPincode(pincode: string): Promise<PincodeEntryData | null> {
  const baseUrl = requireCentralApiUrl();
  const res = await fetch(
    `${baseUrl}/api/v1/pincode?search=${encodeURIComponent(`pincode:${pincode}`)}&limit=1`,
    { headers: { "x-api-key": CENTRAL_API_KEY || "" }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`central-api pincode lookup failed (${res.status})`);
  const body = await res.json();
  return body.items && body.items[0] ? body.items[0] : null;
}
