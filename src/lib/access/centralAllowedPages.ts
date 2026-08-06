/**
 * Resolves the set of AN-CRM page keys a given central-api role name is
 * allowed to see, for the sidebar filter in api/ui/sidebar/route.ts.
 * Mirrors ANgroup's identical file -- see that file's comment for the
 * full reasoning (SEPARATE, coarser layer on top of the local Role/
 * Permission system; null = unrestricted; Reports/Profile always exempt;
 * Settings governed purely by allowedPages, "case to case").
 *
 * Central-api is the SOURCE (the Roles & Access panel edits there
 * directly) -- but every actual page-access CHECK reads a LOCAL cache
 * (RoleCatalogCache) instead of making a live central-api call on every
 * single request, per explicit direction ("central-api is the source,
 * local is a synced cache"). A live central-api outage degrades to
 * "whatever was last synced" rather than breaking every page load in the
 * app -- the same fail-soft property every other centralized feature
 * built this session already has. The cache is refreshed:
 *   1. Immediately after any mutation from the Roles & Access panel
 *      (api/businesses/[id]/role-catalog/route.ts calls
 *      refreshRoleCatalogCache() right after writing to central-api).
 *   2. Lazily here, once, the first time a business has no cache row yet
 *      (bootstrap) -- a real central-api call, but only ever once per
 *      business until the next mutation/manual sync.
 *   3. On demand via the Roles & Access panel's "Sync now" button.
 */
import { connectDB } from "@/lib/mongodb";
import RoleCatalogCache from "@/models/RoleCatalogCache";

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
const APP_NAME = "an-crm";

const ALWAYS_ALLOWED_KEYS = new Set(["reports", "profile", "account"]);

function headers() {
  return { "x-api-key": CENTRAL_API_KEY || "" };
}

/**
 * Live central-api fetch (role-catalog + page registry for this business),
 * resolved into {roleName -> pageKeys[]} for EVERY role on the business
 * (not just one), and written into the local cache. Called by the Roles &
 * Access panel's mutation endpoint right after every write, and lazily by
 * resolveAllowedPageKeys() on a cache miss. Never throws -- a failed
 * refresh just leaves the existing cache (or no cache) in place.
 */
export async function refreshRoleCatalogCache(localBusinessId: string): Promise<boolean> {
  if (!CENTRAL_API_URL || !localBusinessId) return false;
  try {
    const bizRes = await fetch(
      `${CENTRAL_API_URL}/api/v1/businesses?search=${encodeURIComponent(`sourceId:${localBusinessId}`)}&limit=1`,
      { headers: headers(), cache: "no-store" }
    );
    const bizBody = await bizRes.json().catch(() => null);
    const centralBusinessId = bizBody?.items?.[0]?._id;
    if (!centralBusinessId) return false;

    const [catalogRes, pagesRes] = await Promise.all([
      fetch(`${CENTRAL_API_URL}/api/v1/role-catalog?businessId=${centralBusinessId}`, { headers: headers(), cache: "no-store" }),
      fetch(`${CENTRAL_API_URL}/api/v1/pageregistry?limit=1000&search=app:${APP_NAME}`, { headers: headers(), cache: "no-store" }),
    ]);
    const catalogBody = await catalogRes.json().catch(() => null);
    const pagesBody = await pagesRes.json().catch(() => null);
    if (!catalogRes.ok) return false;

    const roles: { roleName: string; allowedPages: string[]; categoryKey?: string }[] = catalogBody?.roles || [];
    const business = catalogBody?.business;
    const pagesById = new Map((pagesBody?.items || []).map((p: any) => [p._id, p.pageKey]));

    const resolvedRoles = roles
      .filter((r) => !business?.roleCategoryKey || r.categoryKey === business.roleCategoryKey)
      .map((r) => ({
        roleName: r.roleName,
        allowedPages: r.allowedPages.map((id) => pagesById.get(id)).filter(Boolean) as string[],
      }));

    await connectDB();
    await RoleCatalogCache.findOneAndUpdate(
      { businessId: localBusinessId },
      { businessId: localBusinessId, categoryKey: business?.roleCategoryKey || null, roles: resolvedRoles, syncedAt: new Date() },
      { upsert: true }
    );
    return true;
  } catch (err) {
    console.error(`[centralAllowedPages] refreshRoleCatalogCache(${localBusinessId}) failed:`, (err as any)?.message || err);
    return false;
  }
}

export async function resolveAllowedPageKeys(
  localBusinessId: string,
  centralRole: string | null | undefined
): Promise<Set<string> | null> {
  if (!localBusinessId || !centralRole) return null;

  try {
    await connectDB();
    let cache = await RoleCatalogCache.findOne({ businessId: localBusinessId }).lean();

    // Bootstrap: no cache row exists yet for this business at all -- do
    // one live resolve-and-write, then read back from what was just
    // cached. Every subsequent call for this business is a pure local
    // read until the next mutation/manual sync refreshes it again.
    if (!cache) {
      const refreshed = await refreshRoleCatalogCache(localBusinessId);
      if (!refreshed) return null;
      cache = await RoleCatalogCache.findOne({ businessId: localBusinessId }).lean();
      if (!cache) return null;
    }

    const matchedRole = cache.roles.find((r) => r.roleName === centralRole);
    if (!matchedRole || matchedRole.allowedPages.length === 0) return null;

    const pageKeys = new Set<string>(matchedRole.allowedPages);
    ALWAYS_ALLOWED_KEYS.forEach((k) => pageKeys.add(k));
    return pageKeys;
  } catch (err) {
    console.error("[centralAllowedPages] resolution failed:", (err as any)?.message || err);
    return null;
  }
}

export { ALWAYS_ALLOWED_KEYS };
