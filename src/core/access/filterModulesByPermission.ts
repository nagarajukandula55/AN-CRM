import type { IModuleDefinition } from "@/core/module-registry/ModuleDefinition.model";
import { buildPermissionCode } from "./actions";
import { MODULE_KEY_ALIASES } from "./moduleKeyAliases";

export interface SidebarModule {
  key: string;
  label: string;
  route: string;
  icon: string;
}

// A candidate's own `key` is sometimes the sidebar's UI key (e.g.
// "admin-settings") and sometimes already the real enforced permission
// key (e.g. "settings") -- resolve to whichever one buildPermissionCode
// actually needs to match a granted code, same alias table used
// everywhere else this mismatch shows up.
function realPermissionKey(key: string): string {
  return MODULE_KEY_ALIASES[key] || key;
}

/**
 * Replaces the original filterModules() in services/moduleEngine.service.ts.
 * That function checked a flat accessKeys[] against Business.modules[].access
 * (module-level only — no per-action granularity). This version checks the
 * VIEW permission for each module against the user's resolved permissions
 * list (from getEnrichedSession() -> User -> UserRole -> Role ->
 * RolePermission -> Permission), which is the real access-control chain
 * that already existed and worked — just wasn't connected to the sidebar.
 *
 * A module shows in the sidebar if the user holds its "view" permission
 * (e.g. "INVENTORY.VIEW"). This is a deliberate, minimal bar: seeing a menu
 * item requires only view access; finer-grained actions (create/edit/
 * delete/etc.) are enforced at the point of use (the relevant API routes),
 * not by hiding/showing sidebar entries per action.
 */
export function filterModulesByPermission(
  modules: Pick<IModuleDefinition, "key" | "label" | "route" | "icon" | "enabled">[],
  userPermissions: string[],
  isSuperAdmin: boolean
): SidebarModule[] {
  const granted = new Set(userPermissions);

  return modules
    .filter((m) => m.enabled)
    .filter((m) => {
      if (isSuperAdmin) return true; // super admin always sees everything, matches existing x-is-super-admin convention
      const realKey = realPermissionKey(m.key);
      const viewCode = buildPermissionCode(realKey, "view");
      if (granted.has(viewCode)) return true;
      // "crm" (CRM Dashboard) was, until now, never grantable through the
      // Roles & Permissions UI at all (see moduleHierarchy.ts's comment) --
      // any role that already holds crm_calls.view or crm_jobsheets.view
      // was granted "CRM module access" in intent, so self-heal existing
      // roles by implying CRM.VIEW from either child rather than requiring
      // every affected role to be re-saved by hand.
      if (realKey === "crm") {
        return (
          granted.has(buildPermissionCode("crm_calls", "view")) ||
          granted.has(buildPermissionCode("crm_jobsheets", "view"))
        );
      }
      return false;
    })
    .map((m) => ({
      key: m.key,
      label: m.label,
      route: m.route,
      icon: m.icon ?? "Box",
    }));
}
