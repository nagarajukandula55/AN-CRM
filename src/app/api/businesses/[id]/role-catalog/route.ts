import { NextResponse } from "next/server";
import { getBusinessBySourceId } from "@/lib/centralApiRead";
import { refreshRoleCatalogCache } from "@/lib/access/centralAllowedPages";

/**
 * Proxies central-api's role-catalog for ONE business, resolved from this
 * app's own local business _id (the URL param) to central-api's business
 * _id via sourceId -- see lib/centralApiSync.ts's own comment for why
 * these ids differ (central-api mints its own _id, stores this app's id
 * as sourceId). Lets Business Settings manage roles/allowed-pages
 * directly against central-api's shared catalog, using this server's own
 * CENTRAL_API_KEY (a regular site key -- central-api's role-catalog
 * routes are reachable by any site key, not just its admin key, see
 * central-api's routes/roleCatalog.js).
 *
 * Authorization is this app's own -- callers must already be authenticated
 * via the normal middleware (an_token), which is all that's needed here
 * since only super admins/platform staff reach the Business view page
 * these calls come from.
 */

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;

function centralHeaders() {
  return { "x-api-key": CENTRAL_API_KEY || "", "Content-Type": "application/json" };
}

async function resolveCentralBusinessId(localBusinessId: string): Promise<string | null> {
  const business = await getBusinessBySourceId(localBusinessId);
  // getBusinessBySourceId() remaps sourceId back onto _id (see
  // centralApiRead.ts's comment) -- the actual central-api _id is only
  // available via a raw lookup, so re-fetch without the remap here.
  if (!CENTRAL_API_URL) return null;
  const res = await fetch(
    `${CENTRAL_API_URL}/api/v1/businesses?search=${encodeURIComponent(`sourceId:${localBusinessId}`)}&limit=1`,
    { headers: centralHeaders(), cache: "no-store" }
  );
  if (!res.ok) return null;
  const body = await res.json();
  return body.items?.[0]?._id || null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CENTRAL_API_URL) {
    return NextResponse.json({ error: "CENTRAL_API_URL is not configured" }, { status: 503 });
  }

  const centralBusinessId = await resolveCentralBusinessId(id);
  if (!centralBusinessId) {
    return NextResponse.json({ error: "This business isn't synced to central-api yet." }, { status: 404 });
  }

  const [catalogRes, pagesRes, teamRes] = await Promise.all([
    fetch(`${CENTRAL_API_URL}/api/v1/role-catalog?businessId=${centralBusinessId}`, { headers: centralHeaders(), cache: "no-store" }),
    fetch(`${CENTRAL_API_URL}/api/v1/pageregistry?limit=1000`, { headers: centralHeaders(), cache: "no-store" }),
    fetch(`${CENTRAL_API_URL}/api/v1/role-catalog/business/${centralBusinessId}/team`, { headers: centralHeaders(), cache: "no-store" }),
  ]);
  const catalogData = await catalogRes.json().catch(() => ({}));
  const pagesData = await pagesRes.json().catch(() => ({}));
  const teamData = await teamRes.json().catch(() => ({}));

  if (!catalogRes.ok) return NextResponse.json(catalogData, { status: catalogRes.status });
  return NextResponse.json({ ...catalogData, pages: pagesData.items || [], team: teamData.team || [] });
}

// POST { action: "addRole" | "deleteRole" | "setPages" | "setCategory" |
//         "grantAccess" | "revokeAccess", ... }
// -- a single mutation endpoint rather than one route per action, since
// every action needs the same "resolve central business id" prelude.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CENTRAL_API_URL) {
    return NextResponse.json({ error: "CENTRAL_API_URL is not configured" }, { status: 503 });
  }

  const centralBusinessId = await resolveCentralBusinessId(id);
  if (!centralBusinessId) {
    return NextResponse.json({ error: "This business isn't synced to central-api yet." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  try {
    // These four actions change a role's shape or which pages it can see
    // -- refresh this business's local RoleCatalogCache right after each
    // one succeeds, so the edit takes effect on the very next page load
    // instead of waiting for the lazy bootstrap-only refresh. Best-effort:
    // never blocks the response on the refresh's own success/failure.
    if (action === "addRole") {
      const { categoryKey, roleName } = body;
      const res = await fetch(`${CENTRAL_API_URL}/api/v1/role-catalog`, {
        method: "POST",
        headers: centralHeaders(),
        body: JSON.stringify({ categoryKey, roleName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) refreshRoleCatalogCache(id).catch(() => {});
      return NextResponse.json(data, { status: res.status });
    }

    if (action === "deleteRole") {
      const { roleId } = body;
      const res = await fetch(`${CENTRAL_API_URL}/api/v1/role-catalog/${roleId}`, {
        method: "DELETE",
        headers: centralHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) refreshRoleCatalogCache(id).catch(() => {});
      return NextResponse.json(data, { status: res.status });
    }

    if (action === "setPages") {
      const { roleId, allowedPages } = body;
      const res = await fetch(`${CENTRAL_API_URL}/api/v1/role-catalog/${roleId}/pages`, {
        method: "PUT",
        headers: centralHeaders(),
        body: JSON.stringify({ allowedPages }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) refreshRoleCatalogCache(id).catch(() => {});
      return NextResponse.json(data, { status: res.status });
    }

    if (action === "setCategory") {
      const { roleCategoryKey } = body;
      const res = await fetch(`${CENTRAL_API_URL}/api/v1/role-catalog/business/${centralBusinessId}/category`, {
        method: "PUT",
        headers: centralHeaders(),
        body: JSON.stringify({ roleCategoryKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) refreshRoleCatalogCache(id).catch(() => {});
      return NextResponse.json(data, { status: res.status });
    }

    if (action === "syncNow") {
      const refreshed = await refreshRoleCatalogCache(id);
      return NextResponse.json({ success: refreshed });
    }

    if (action === "grantAccess") {
      const { email, role } = body;
      const res = await fetch(`${CENTRAL_API_URL}/api/v1/role-catalog/business/${centralBusinessId}/team`, {
        method: "PUT",
        headers: centralHeaders(),
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: res.status });
    }

    if (action === "revokeAccess") {
      const { userId } = body;
      const res = await fetch(`${CENTRAL_API_URL}/api/v1/role-catalog/business/${centralBusinessId}/team/${userId}`, {
        method: "DELETE",
        headers: centralHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[role-catalog proxy] error:", err?.message || err);
    return NextResponse.json({ error: "central-api request failed" }, { status: 502 });
  }
}
