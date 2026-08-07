import { getUiConfigValue } from "./getUiConfigValue";

/**
 * Sidebar icon overrides, sourced from central-api's UI Config store
 * (AN CRM Admin -> UI Config -> type "icon", key "sidebar-icons") --
 * lets an admin swap a nav item's lucide-react icon name without an
 * AN-CRM deploy. This route runs on every sidebar render, so the
 * central-api read is cached in-process for 60s rather than done live
 * on every request.
 */
let cache: { value: Record<string, string>; expiresAt: number } | null = null;

export async function getSidebarIconOverrides(): Promise<Record<string, string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const value = await getUiConfigValue<Record<string, string>>("icon", "sidebar-icons", {});
  cache = { value, expiresAt: Date.now() + 60_000 };
  return value;
}
