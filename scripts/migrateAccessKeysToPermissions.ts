/**
 * ONE-TIME DATA MIGRATION: UserBusinessAccess.accessKeys -> Role/RolePermission
 *
 * Context: the original access-control system was a flat accessKeys[] per
 * user per business (e.g. "ADMIN", "AI_ACCESS", "LOGISTICS_ACCESS"), matched
 * against Business.modules[].access[].key to decide sidebar visibility. The
 * new system (per the full-cutover decision in PROGRESS.md) uses
 * User -> UserRole -> Role -> RolePermission -> Permission, checked against
 * ModuleDefinition-derived permission codes like "INVENTORY.VIEW".
 *
 * These are not a 1:1 rename — the old accessKeys were coarse per-module
 * flags with no distinction between viewing and editing. This migration
 * therefore grants VIEW + CREATE + EDIT + DELETE (the full CRUD set) for
 * any module a user's accessKeys already unlocked, since that's the closest
 * honest equivalent of what "has this access key" meant before: full
 * access to that module, not just read-only. It does NOT attempt to guess
 * finer-grained distinctions the old system never captured.
 *
 * "ADMIN" as an access key is treated as a superset: a user holding "ADMIN"
 * gets every module's full CRUD grant (matching that DEFAULT_MODULES
 * template's use of "ADMIN" as the catch-all key for every default module).
 *
 * HOW TO RUN (do this ONCE, after the sidebar cutover deploys, before or
 * immediately after cutting production traffic to the new sidebar route):
 *   npx tsx scripts/migrateAccessKeysToPermissions.ts
 *
 * This script is READ-HEAVY and WRITE-ONCE-PER-USER-ROLE. It is safe to
 * run more than once (it creates a role named "Migrated: <business name>"
 * per business the first time, and reuses it on subsequent runs rather
 * than creating duplicates) but should not be needed more than once in
 * normal operation.
 *
 * DOES NOT delete UserBusinessAccess or Business.modules[].access data —
 * leaves the old data in place so it can be double-checked/rolled back to
 * if the migration surfaces a discrepancy. A separate, deliberate cleanup
 * step (deleting the old collections/fields) should happen only after the
 * new system has been confirmed working in production for a reasonable
 * period — do not fold that into this script.
 */

import { connectDB } from "../src/core/db/mongodb";
import UserBusinessAccess from "../src/models/UserBusinessAccess";
import Business from "../src/models/Business";
import Role, { RoleType, RoleStatus } from "../src/models/Role";
import UserRole from "../src/models/UserRole";
import RolePermission from "../src/models/RolePermission";
import Permission, { PermissionType, PermissionStatus } from "../src/models/Permission";
import { buildPermissionCode, STANDARD_ACTIONS } from "../src/core/access/actions";

const CRUD_ACTIONS = ["view", "create", "edit", "delete"] as const;

async function ensurePermission(moduleKey: string, actionKey: string, moduleLabel: string) {
  const code = buildPermissionCode(moduleKey, actionKey);
  const action = STANDARD_ACTIONS.find((a) => a.key === actionKey)!;
  const existing = await Permission.findOneAndUpdate(
    { code },
    {
      $setOnInsert: {
        code,
        type: PermissionType.SYSTEM,
        status: PermissionStatus.ACTIVE,
        isActive: true,
        isProtected: true,
      },
      $set: {
        name: `${action.label} ${moduleLabel}`,
        description: `${action.description} in ${moduleLabel}. (migrated from legacy accessKeys)`,
        module: moduleKey,
        group: moduleLabel,
      },
    },
    { upsert: true, new: true }
  );
  return existing;
}

async function migrateOneBusiness(business: any) {
  const modules: any[] = business.modules ?? [];

  // Build: accessKey -> list of module keys it unlocks (mirrors filterModules()'s
  // matching logic exactly, so the migration grants exactly what the old
  // system would have shown).
  const accessKeyToModules = new Map<string, string[]>();
  for (const mod of modules) {
    const keys: string[] = (mod.access ?? []).map((a: any) => a.key);
    // A module with no access entries was visible to EVERYONE with any
    // access record at all (see filterModules: `if (!m.access || m.access.length === 0) return true`).
    if (keys.length === 0) {
      accessKeyToModules.set("__ANY__", [
        ...(accessKeyToModules.get("__ANY__") ?? []),
        mod.key,
      ]);
      continue;
    }
    for (const key of keys) {
      accessKeyToModules.set(key, [...(accessKeyToModules.get(key) ?? []), mod.key]);
    }
  }

  const grants = await UserBusinessAccess.find({
    businessId: business._id,
    isActive: true,
  }).lean();

  if (grants.length === 0) return { business: business.name, usersProcessed: 0 };

  // One migrated role per business, reused across that business's users —
  // simpler than one role per user, and matches how roles are meant to work.
  const roleCode = `MIGRATED_${String(business._id)}`;
  let role = await Role.findOne({ code: roleCode });
  if (!role) {
    role = await Role.create({
      businessId: business._id,
      name: `Migrated Access: ${business.name}`,
      code: roleCode,
      description: "Auto-created by migrateAccessKeysToPermissions.ts from legacy UserBusinessAccess.accessKeys data. Safe to rename or split into finer-grained roles later.",
      type: RoleType.CUSTOM,
      status: RoleStatus.ACTIVE,
      isSystem: false,
      permissions: [],
    });
  }

  // Union of every module any user in this business had access to, so we
  // only need to ensure permissions/grants exist for modules actually used.
  const allModuleKeysNeeded = new Set<string>();
  for (const [, moduleKeys] of accessKeyToModules) {
    moduleKeys.forEach((k) => allModuleKeysNeeded.add(k));
  }

  const modulesByKey = new Map(modules.map((m) => [m.key, m]));
  const permissionIdsByCode = new Map<string, string>();

  for (const moduleKey of allModuleKeysNeeded) {
    const moduleLabel = modulesByKey.get(moduleKey)?.label ?? moduleKey;
    for (const action of CRUD_ACTIONS) {
      const perm = await ensurePermission(moduleKey, action, moduleLabel);
      permissionIdsByCode.set(buildPermissionCode(moduleKey, action), String(perm._id));
    }
  }

  // Grant the union of ALL modules referenced by ANY accessKey to this
  // single migrated role — the role represents "this business's legacy
  // access system," and individual users are differentiated by whether
  // they're assigned this role at all (matching the original all-or-
  // nothing-per-module granularity of accessKeys).
  const allPermissionIds = [...permissionIdsByCode.values()];
  await RolePermission.deleteMany({ roleId: role._id });
  if (allPermissionIds.length > 0) {
    await RolePermission.insertMany(
      allPermissionIds.map((permissionId) => ({ roleId: role._id, permissionId }))
    );
  }
  role.permissions = [...permissionIdsByCode.keys()];
  await role.save();

  let usersProcessed = 0;
  for (const grant of grants) {
    const hasAdmin = grant.accessKeys?.includes("ADMIN");
    const hasAny = hasAdmin || (grant.accessKeys?.length ?? 0) > 0;
    if (!hasAny) continue;

    await UserRole.updateOne(
      { userId: grant.userId, roleId: role._id },
      { $setOnInsert: { userId: grant.userId, roleId: role._id, businessId: business._id } },
      { upsert: true }
    );
    usersProcessed++;
  }

  return { business: business.name, usersProcessed, modulesGranted: [...allModuleKeysNeeded] };
}

async function main() {
  await connectDB();
  const businesses = await Business.find({ isActive: true }).lean();

  const results = [];
  for (const business of businesses) {
    const result = await migrateOneBusiness(business);
    results.push(result);
    console.log(`Migrated ${business.name}:`, result);
  }

  console.log("\nMigration complete. Summary:");
  console.table(results);
  console.log(
    "\nIMPORTANT: UserBusinessAccess data was NOT deleted. Verify the new " +
    "sidebar (Permission-based) shows the same modules per user as before, " +
    "then plan a separate cleanup pass once confirmed stable."
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
