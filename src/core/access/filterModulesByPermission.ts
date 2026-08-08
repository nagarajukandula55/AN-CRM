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

// Pure navigation entries -- whatever real authorization matters for
// what they show happens inside the page/API itself (dashboards render
// whatever the caller is already allowed to see; sub-vendors' own create
// action re-checks resolveOwnerOrManagerVendor), not by holding a
// separate granted VIEW permission for the nav link. Gating these behind
// the normal permission check means every brand-new key here is
// invisible to every already-provisioned role until a migration re-syncs
// their granted permissions -- found live three separate times in one
// session (Workorders, the SC dashboard nav entry, Sub-Vendors), so
// fixing the class of bug here instead of aliasing one key at a time.
// Quotations/Delivery Challans/Credit Notes/Debit Notes/Proforma Invoices
// are the same bug again -- added to sidebar-nav.ts and to SC's default
// allowed-module list this session, but no existing role's granted
// permissions were ever migrated to include them, so they stayed
// invisible for every already-provisioned vendor (reported live: "did
// not see anything like estimation or quotation in menu"). These are
// ordinary document-generation screens with no separate access-control
// story of their own (same as the others already in this set), not a
// deliberate per-role gate someone configured.
const ALWAYS_VISIBLE_KEYS = new Set([
  "dashboard", "sc_dashboard", "sub-vendors",
  "quotations", "delivery-challans", "credit-notes", "debit-notes", "proforma-invoices",
]);

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
      if (ALWAYS_VISIBLE_KEYS.has(m.key)) return true;
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
