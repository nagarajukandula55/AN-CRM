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

// searchFilter (e.g. "businessId:<id>") is applied server-side, an exact
// match on one field - narrows the paginated fetch to just that filter
// instead of pulling the whole dataset when the caller already knows a
// single-field exact filter it wants (e.g. "just this business's
// customers"), same exact-match semantics as findOne() below.
// Never throws — a central-api outage or misconfiguration must degrade to
// "no data from central-api" (empty list / null), not fail whatever request
// triggered this read. This bit us for real: document-templates/resolve
// (used by every print page — invoice, workorder, service record) called
// getBusinessBySourceId() inside a Promise.all with no try/catch, so a
// single central-api hiccup 500'd invoice AND workorder printing at once.
// Same best-effort contract centralApiSync.ts already has on the write side.
async function fetchAll(dataset: string, searchFilter?: string): Promise<Record<string, any>[]> {
  if (!CENTRAL_API_URL) return [];

  try {
    const items: Record<string, any>[] = [];
    let page = 1;
    while (true) {
      const searchParam = searchFilter ? `&search=${encodeURIComponent(searchFilter)}` : "";
      const res = await fetch(`${CENTRAL_API_URL}/api/v1/${dataset}?page=${page}&limit=${PAGE_SIZE}${searchParam}`, {
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
  } catch (err) {
    console.error(`[centralApiRead] fetchAll(${dataset}) failed:`, (err as any)?.message || err);
    return [];
  }
}

export async function listBusinesses(): Promise<Record<string, any>[]> {
  return fetchAll("businesses");
}

export async function listVendors(): Promise<Record<string, any>[]> {
  return fetchAll("vendors");
}

// Agreement templates are now centrally managed (central-api's
// "agreementtemplates" dataset, editable from its own admin dashboard) so
// every AN Group app shares the exact same catalog instead of each keeping
// its own local copy -- see scripts/migrateAgreementTemplatesToCentral.ts
// for the one-time migration and api/agreements/templates/route.ts for the
// consumer side. assignedBusinessIds is a central-api business _id array;
// empty/missing means "available to every business" (client-side filter,
// same reasoning as fetchAll()'s comment -- central-api's search can't do
// array-contains). businessSourceId is THIS app's own local business _id
// (what everything else in this app already deals in) -- resolved to
// central-api's business _id via getBusinessBySourceId() first.
export async function listAgreementTemplates(businessSourceId?: string): Promise<Record<string, any>[]> {
  // isActive is a boolean field -- central-api's search filter only does
  // string exact/substring match (a boolean compared against "true" never
  // matches, per this file's own top comment), so the isActive filter has
  // to happen client-side here, not via ?search=isActive:true.
  const all = (await fetchAll("agreementtemplates")).filter((t) => t.isActive !== false);
  if (!businessSourceId) return all;

  const business = await getBusinessBySourceId(businessSourceId);
  if (!business) return all.filter((t) => !Array.isArray(t.assignedBusinessIds) || t.assignedBusinessIds.length === 0);

  return all.filter(
    (t) =>
      !Array.isArray(t.assignedBusinessIds) ||
      t.assignedBusinessIds.length === 0 ||
      t.assignedBusinessIds.includes(business._id)
  );
}

export async function getAgreementTemplateByType(type: string): Promise<Record<string, any> | null> {
  return findOne("agreementtemplates", "type", type);
}

// Never throws — see fetchAll()'s comment above for why.
async function findOne(dataset: string, field: string, value: string): Promise<Record<string, any> | null> {
  if (!CENTRAL_API_URL) return null;
  try {
    const res = await fetch(
      `${CENTRAL_API_URL}/api/v1/${dataset}?search=${encodeURIComponent(`${field}:${value}`)}&limit=1`,
      { headers: headers(), cache: "no-store" }
    );
    if (!res.ok) throw new Error(`central-api ${dataset} lookup failed (${res.status})`);
    const body = await res.json();
    const item = body.items && body.items[0];
    return item ? remapId(item) : null;
  } catch (err) {
    console.error(`[centralApiRead] findOne(${dataset}, ${field}:${value}) failed:`, (err as any)?.message || err);
    return null;
  }
}

export async function getBusinessBySourceId(sourceId: string): Promise<Record<string, any> | null> {
  return findOne("businesses", "sourceId", sourceId);
}

export interface VendorOnboardingConfig {
  skipVendorApproval: boolean;
  vendorTypeModules: { appliedAs: string; moduleKeys: string[] }[];
  documents: Record<string, any>[];
  steps: Record<string, any>[];
}

// Central-api is the single source of truth for per-business vendor
// onboarding settings (skip-approval, vendor-type module access, document
// requirements, onboarding steps) -- editable from its own dashboard's
// Access tab, shared across every consuming app instead of each keeping
// its own local copy (same pattern as agreement templates). businessId
// here is THIS app's own local Business._id; resolved to central-api's
// business _id via sourceId first, same join every other helper in this
// file uses. Never throws -- returns null on any failure (central-api
// unreachable, business not yet synced, etc.), so callers fall back to
// local config rather than breaking vendor apply/activation.
export async function getVendorOnboardingConfig(businessId: string): Promise<VendorOnboardingConfig | null> {
  if (!CENTRAL_API_URL || !businessId) return null;
  try {
    // getBusinessBySourceId() remaps _id back to the local sourceId (by
    // design, for callers that want the local shape) -- this needs
    // central-api's OWN raw _id instead, same direct-search approach
    // api/auth/login/route.ts's centralRole resolution already uses.
    const bizRes = await fetch(
      `${CENTRAL_API_URL}/api/v1/businesses?search=${encodeURIComponent(`sourceId:${businessId}`)}&limit=1`,
      { headers: headers(), cache: "no-store" }
    );
    if (!bizRes.ok) throw new Error(`central-api business lookup failed (${bizRes.status})`);
    const bizBody = await bizRes.json();
    const centralBusinessId = bizBody?.items?.[0]?._id;
    if (!centralBusinessId) return null;

    const res = await fetch(`${CENTRAL_API_URL}/api/v1/vendor-onboarding-config/business/${centralBusinessId}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`central-api vendor-onboarding-config fetch failed (${res.status})`);
    const body = await res.json();
    return {
      skipVendorApproval: !!body.skipVendorApproval,
      vendorTypeModules: Array.isArray(body.vendorTypeModules) ? body.vendorTypeModules : [],
      documents: Array.isArray(body.documents) ? body.documents : [],
      steps: Array.isArray(body.steps) ? body.steps : [],
    };
  } catch (err) {
    console.error(`[centralApiRead] getVendorOnboardingConfig(${businessId}) failed:`, (err as any)?.message || err);
    return null;
  }
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

// Mirrors GET /api/customers' own filtering: optional exact businessId
// scope (applied server-side, narrows the paginated fetch), optional
// free-text substring search across name/phone/email/IMEI-or-serial
// (applied client-side — central-api's search is single-field only, this
// needs an $or across several), sorted newest-first, capped the same way
// the original Mongoose query was (.limit(500)).
export async function listCustomers(opts?: { businessId?: string; search?: string }): Promise<Record<string, any>[]> {
  const all = await fetchAll("customers", opts?.businessId ? `businessId:${opts.businessId}` : undefined);
  const search = opts?.search?.trim().toLowerCase();
  const filtered = search
    ? all.filter((c) => {
        if ([c.name, c.phone, c.email].some((v) => typeof v === "string" && v.toLowerCase().includes(search))) return true;
        const imeis: unknown = c.imeiOrSerialNumbers;
        return Array.isArray(imeis) && imeis.some((v) => typeof v === "string" && v.toLowerCase().includes(search));
      })
    : all;
  return filtered
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 500);
}
