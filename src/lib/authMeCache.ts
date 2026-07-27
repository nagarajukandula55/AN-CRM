"use client";

/**
 * Shared client-side cache/dedup for GET /api/auth/me. This one endpoint is
 * called independently from 40+ places (sidebar.tsx, AnuWidget.tsx,
 * useActiveBusinessId.ts, and most page.tsx files) -- on a typical admin
 * page load, sidebar + AnuWidget + useActiveBusinessId alone fire it 3
 * times concurrently, each re-running the same User/UserRole/Role/Business
 * lookups in api/auth/me/route.ts. That tripling was flagged as the
 * highest-impact fix in a performance audit of "dashboard/pages loading
 * slowly." This module makes concurrent calls share one in-flight request,
 * and keeps the result briefly cached so back-to-back mounts (sidebar,
 * then AnuWidget, then a page's own fetch, all within the same tick/frame)
 * don't each start a fresh request.
 *
 * Short TTL (not "forever") because this data changes on login/logout/
 * business-switch -- callers that mutate server-side session state
 * (switch-business, logout) should call invalidateAuthMeCache() themselves
 * rather than relying on the TTL alone.
 */

const TTL_MS = 4000;

let inFlight: Promise<any> | null = null;
let cached: { data: any; at: number } | null = null;

export function getAuthMe(): Promise<any> {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return Promise.resolve(cached.data);
  }
  if (inFlight) return inFlight;

  inFlight = fetch("/api/auth/me")
    .then((r) => r.json())
    .then((data) => {
      cached = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Call after login, logout, or switch-business -- anything that changes
 * what the next /api/auth/me response should contain. */
export function invalidateAuthMeCache() {
  cached = null;
  inFlight = null;
}
