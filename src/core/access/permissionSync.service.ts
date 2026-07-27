import Permission, { PermissionType, PermissionStatus } from "@/models/Permission";
import Role, { RoleType, RoleStatus } from "@/models/Role";
import type { IModuleDefinition } from "@/core/module-registry/ModuleDefinition.model";
import { STANDARD_ACTIONS, buildPermissionCode, resolveActionsForModule } from "./actions";

/**
 * Keeps the existing Permission collection in sync with the module
 * registry. This is the piece that actually delivers "map access to every
 * module and option so giving access becomes easy": instead of a developer
 * hand-writing a Permission document for every module/action combination
 * (which is how the original repo ended up with an inconsistent, partial
 * set of permission codes), every module — built-in or admin-created —
 * automatically gets one Permission per applicable standard action the
 * moment it's created, and this function is re-run whenever a module's
 * applicableActions change.
 *
 * Reuses the EXISTING Permission model from the original repo rather than
 * inventing a new one — that model already has exactly the right shape
 * (code, module, group, type SYSTEM/CUSTOM, isActive). This function is
 * purely the missing "keep it populated automatically" piece.
 */
export async function syncPermissionsForModule(
  moduleDef: Pick<IModuleDefinition, "key" | "label" | "isSystem" | "applicableActions">
): Promise<void> {
  const actions = resolveActionsForModule(moduleDef.applicableActions);

  for (const action of actions) {
    const code = buildPermissionCode(moduleDef.key, action.key);

    await Permission.updateOne(
      { code },
      {
        $setOnInsert: {
          code,
          type: moduleDef.isSystem ? PermissionType.SYSTEM : PermissionType.CUSTOM,
          status: PermissionStatus.ACTIVE,
          isActive: true,
          isProtected: moduleDef.isSystem, // system-module permissions can't be deleted from the UI
        },
        $set: {
          name: `${action.label} ${moduleDef.label}`,
          description: `${action.description} in ${moduleDef.label}.`,
          module: moduleDef.key,
          group: moduleDef.label,
        },
      },
      { upsert: true }
    );
  }

  // Deactivate (not delete — preserve audit history / existing role grants)
  // any previously-generated permissions for actions that no longer apply
  // to this module, e.g. an admin removed "delete" from applicableActions.
  const currentCodes = actions.map((a) => buildPermissionCode(moduleDef.key, a.key));
  await Permission.updateMany(
    {
      module: moduleDef.key,
      code: { $nin: currentCodes },
      type: moduleDef.isSystem ? PermissionType.SYSTEM : PermissionType.CUSTOM,
    },
    { $set: { isActive: false, status: PermissionStatus.INACTIVE } }
  );
}

/**
 * Keeps the SUPER_ADMIN role holding every active permission in the system.
 * The isSuperAdmin flag already bypasses every requirePermission() check
 * unconditionally (see middleware/permission.guard.ts), so this role's
 * permissions array is never actually load-bearing for access control --
 * but the Roles admin UI reads Role.permissions to show what a role grants,
 * and an admin seeing "Super Admin: 0 permissions" reads as a broken/blank
 * role even though it isn't. Call this after any permission-set change
 * (module create/edit, seedSystemModules) so it can never drift stale.
 */
export async function syncSuperAdminRole(): Promise<void> {
  const allCodes = await Permission.find({ isActive: true }).distinct("code");

  await Role.updateOne(
    { code: "SUPER_ADMIN" },
    {
      $setOnInsert: {
        code: "SUPER_ADMIN",
        name: "Super Admin",
        description: "Full, unconditional system access.",
        type: RoleType.SYSTEM,
        status: RoleStatus.ACTIVE,
        isSystem: true,
        isProtected: true,
      },
      $set: { permissions: allCodes },
    },
    { upsert: true }
  );

  // The legacy coarse role buckets (api/admin/users' ASSIGNABLE_ROLES) used
  // to get silently minted as blank, zero-permission Role docs the first
  // time anyone typed one into the Add/Edit User form -- an admin had no
  // idea they existed or that they granted nothing. Ensuring these exist
  // as real, visible, editable-in-the-Roles-UI documents up front closes
  // that hole; $setOnInsert only, so an admin's later customization here
  // is never stomped by a re-run of this sync.
  const BASE_ROLES = [
    { code: "ADMIN", name: "Admin", description: "Administrative access, permissions configured per business." },
    { code: "MANAGER", name: "Manager", description: "Management access, permissions configured per business." },
    { code: "EMPLOYEE", name: "Employee", description: "Standard staff access, permissions configured per business." },
    { code: "VENDOR", name: "Vendor", description: "Vendor-portal access, permissions configured per business." },
    { code: "CUSTOMER", name: "Customer", description: "No admin-panel access by default." },
  ];
  for (const role of BASE_ROLES) {
    await Role.updateOne(
      { code: role.code },
      {
        $setOnInsert: {
          ...role,
          type: RoleType.SYSTEM,
          status: RoleStatus.ACTIVE,
          isSystem: true,
          isProtected: true,
          permissions: [],
        },
      },
      { upsert: true }
    );
  }
}

/**
 * The base MANAGER role was seeded with permissions: [] ("configured per
 * business" -- an admin was expected to hand-check every box on the Access
 * Matrix for every business's Manager). Per explicit direction ("give me
 * full access to manager roles"), MANAGER now gets every active permission
 * up front, same mechanism as syncSuperAdminRole() above -- $set so it
 * stays current if new modules/permissions are added later. This is safe
 * with the module-enabled cross-check now in session-enriched.ts: a
 * Manager's actual usable permissions at request time are still cut down
 * to whatever modules are enabled for their active business, this just
 * means Manager is never missing a grant for something that IS enabled.
 * Call alongside syncSuperAdminRole() wherever that's invoked.
 */
export async function syncManagerRole(): Promise<void> {
  const allCodes = await Permission.find({ isActive: true }).distinct("code");

  await Role.updateOne(
    { code: "MANAGER" },
    {
      $setOnInsert: {
        code: "MANAGER",
        name: "Manager",
        type: RoleType.SYSTEM,
        status: RoleStatus.ACTIVE,
        isSystem: true,
        isProtected: true,
      },
      $set: {
        description: "Full access to every module enabled for the business.",
        permissions: allCodes,
      },
    },
    { upsert: true }
  );
}

/**
 * Convenience: the full permission code list for a module, without writing
 * anything — used by the access-matrix UI to know what checkboxes to render
 * for a module even before/without touching the database.
 */
export function permissionCodesForModule(
  moduleKey: string,
  applicableActions?: string[]
): { code: string; actionKey: string; label: string }[] {
  return resolveActionsForModule(applicableActions).map((action) => ({
    code: buildPermissionCode(moduleKey, action.key),
    actionKey: action.key,
    label: action.label,
  }));
}

export { STANDARD_ACTIONS };
