/**
 * Resolves the set of AN-CRM page keys a given central-api role name is
 * allowed to see, for the sidebar filter in api/ui/sidebar/route.ts.
 * Mirrors ANgroup's identical file -- see that file's comment for the
 * full reasoning (SEPARATE, coarser layer on top of the local Role/
 * Permission system; null = unrestricted; Reports/Profile always exempt;
 * Settings governed purely by allowedPages, "case to case").
 */

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
const APP_NAME = "an-crm";

const ALWAYS_ALLOWED_KEYS = new Set(["reports", "profile", "account"]);

function headers() {
  return { "x-api-key": CENTRAL_API_KEY || "" };
}

export async function resolveAllowedPageKeys(
  localBusinessId: string,
  centralRole: string | null | undefined
): Promise<Set<string> | null> {
  if (!CENTRAL_API_URL || !centralRole) return null;

  try {
    const bizRes = await fetch(
      `${CENTRAL_API_URL}/api/v1/businesses?search=${encodeURIComponent(`sourceId:${localBusinessId}`)}&limit=1`,
      { headers: headers(), cache: "no-store" }
    );
    const bizBody = await bizRes.json().catch(() => null);
    const centralBusinessId = bizBody?.items?.[0]?._id;
    if (!centralBusinessId) return null;

    const catalogRes = await fetch(`${CENTRAL_API_URL}/api/v1/role-catalog?businessId=${centralBusinessId}`, {
      headers: headers(),
      cache: "no-store",
    });
    const catalogBody = await catalogRes.json().catch(() => null);
    const roles: { roleName: string; allowedPages: string[] }[] = catalogBody?.roles || [];

    const matchedRole = roles.find((r) => r.roleName === centralRole);
    if (!matchedRole || matchedRole.allowedPages.length === 0) return null;

    const pagesRes = await fetch(`${CENTRAL_API_URL}/api/v1/pageregistry?limit=1000&search=app:${APP_NAME}`, {
      headers: headers(),
      cache: "no-store",
    });
    const pagesBody = await pagesRes.json().catch(() => null);
    const pagesById = new Map((pagesBody?.items || []).map((p: any) => [p._id, p.pageKey]));

    const pageKeys = new Set<string>();
    matchedRole.allowedPages.forEach((pageId) => {
      const key = pagesById.get(pageId);
      if (key) pageKeys.add(String(key));
    });
    ALWAYS_ALLOWED_KEYS.forEach((k) => pageKeys.add(k));

    return pageKeys;
  } catch (err) {
    console.error("[centralAllowedPages] resolution failed:", (err as any)?.message || err);
    return null;
  }
}

export { ALWAYS_ALLOWED_KEYS };
