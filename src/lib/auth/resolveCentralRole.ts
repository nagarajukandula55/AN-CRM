/**
 * Resolves a person's central-api role name for a specific LOCAL business
 * id, given their email. Shared by api/auth/login/route.ts (initial login)
 * and api/auth/switch-business/route.ts (re-issuing the token for a
 * different active business) so both paths compute `centralRole`
 * identically -- switch-business has no fresh central-api login response
 * to read businessAccess from, so it needs a fresh lookup instead.
 *
 * Mirrors ANgroup's identical file -- uses central-api's GET
 * /role-catalog/business/:id/member-role (see that route's own comment in
 * central-api's routes/roleCatalog.js for why it exists: a site-key-
 * accessible way to answer "what role does this one person have on this
 * one business," without needing central-api's admin key just for that).
 *
 * Best-effort: any failure (central-api unreachable, business not synced,
 * no businessAccess entry) returns null, which sidebar filtering treats
 * as unrestricted -- never blocks a login or a business switch.
 */
export async function resolveCentralRoleForBusiness(email: string, localBusinessId: string): Promise<string | null> {
  const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
  const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
  if (!CENTRAL_API_URL || !email || !localBusinessId) return null;

  try {
    const headers = { "x-api-key": CENTRAL_API_KEY || "" };

    const bizRes = await fetch(
      `${CENTRAL_API_URL}/api/v1/businesses?search=${encodeURIComponent(`sourceId:${localBusinessId}`)}&limit=1`,
      { headers, cache: "no-store" }
    );
    const bizBody = await bizRes.json().catch(() => null);
    const centralBusinessId = bizBody?.items?.[0]?._id;
    if (!centralBusinessId) return null;

    const roleRes = await fetch(
      `${CENTRAL_API_URL}/api/v1/role-catalog/business/${centralBusinessId}/member-role?email=${encodeURIComponent(email)}`,
      { headers, cache: "no-store" }
    );
    const roleBody = await roleRes.json().catch(() => null);
    return roleBody?.role || null;
  } catch (err) {
    console.error("[resolveCentralRoleForBusiness] failed:", (err as any)?.message || err);
    return null;
  }
}
