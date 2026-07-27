import Role from "@/models/Role";
import RolePermission from "@/models/RolePermission";
import Permission, { PermissionStatus } from "@/models/Permission";
import { listModulesForBusiness } from "@/core/module-registry/moduleDefinition.service";
import { permissionCodesForModule } from "./permissionSync.service";

/**
 * The access matrix: for a given business, every module crossed with every
 * applicable action, and whether a given role currently has each one. This
 * is the data shape a UI needs to render a "modules × actions" grid of
 * checkboxes — the actual deliverable behind "map access to every module
 * and option so giving access becomes easy."
 */
export interface AccessMatrixRow {
  moduleKey: string;
  moduleLabel: string;
  actions: {
    actionKey: string;
    label: string;
    permissionCode: string;
    granted: boolean;
  }[];
}

export async function getAccessMatrixForRole(
  roleId: string,
  businessId: string
): Promise<AccessMatrixRow[]> {
  const [modules, grantedRolePermissions] = await Promise.all([
    listModulesForBusiness(businessId),
    RolePermission.find({ roleId }).populate("permissionId").lean(),
  ]);

  const grantedCodes = new Set(
    grantedRolePermissions
      .map((rp: any) => rp.permissionId?.code)
      .filter(Boolean)
  );

  return modules.map((moduleDef) => {
    const actions = permissionCodesForModule(moduleDef.key, moduleDef.applicableActions);
    return {
      moduleKey: moduleDef.key,
      moduleLabel: moduleDef.label,
      actions: actions.map((a) => ({
        actionKey: a.actionKey,
        label: a.label,
        permissionCode: a.code,
        granted: grantedCodes.has(a.code),
      })),
    };
  });
}

/**
 * Set a role's ENTIRE permission grant in one call — this is what a "Save"
 * button on the access-matrix UI calls with the full set of checked boxes,
 * rather than requiring one API call per checkbox toggle.
 *
 * grantedPermissionCodes: the full list of permission codes that SHOULD be
 * granted after this call (not a delta) — simpler and safer for a UI grid
 * than incremental add/remove, since the UI already has the full desired
 * state after the user finishes checking boxes.
 */
export async function setRolePermissions(
  roleId: string,
  grantedPermissionCodes: string[],
  updatedBy: string
): Promise<void> {
  const role = await Role.findById(roleId);
  if (!role) {
    throw new Error("Role not found.");
  }
  if (role.isProtected) {
    throw new Error(`Role "${role.name}" is protected and its permissions cannot be changed.`);
  }

  const permissions = await Permission.find({
    code: { $in: grantedPermissionCodes },
    status: PermissionStatus.ACTIVE,
  }).lean();

  const validCodes = new Set(permissions.map((p) => p.code));
  const rejected = grantedPermissionCodes.filter((c) => !validCodes.has(c));
  if (rejected.length > 0) {
    throw new Error(
      `These permission codes are unknown or inactive and cannot be granted: ${rejected.join(", ")}`
    );
  }

  // Replace the role's full grant set. Using deleteMany + insertMany inside
  // no explicit transaction here since RolePermission has no cross-collection
  // side effects that need atomicity beyond this one collection — acceptable
  // for a role-permission reassignment, which is an infrequent admin action.
  await RolePermission.deleteMany({ roleId });
  if (permissions.length > 0) {
    await RolePermission.insertMany(
      permissions.map((p) => ({
        roleId,
        permissionId: p._id,
        createdBy: updatedBy,
      }))
    );
  }

  // Keep the legacy Role.permissions string[] field in sync. That field is
  // a denormalized duplicate of what RolePermission already models properly
  // — it should eventually be removed once every reader of Role.permissions
  // is migrated to query RolePermission instead (see PROGRESS.md). Until
  // then, this keeps the two from silently drifting out of sync.
  role.permissions = permissions.map((p) => p.code);
  await role.save();
}
