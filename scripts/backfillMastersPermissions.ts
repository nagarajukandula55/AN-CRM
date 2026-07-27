/**
 * ONE-TIME: backfill the Permission catalog for the 3 modules just added to
 * moduleHierarchy.ts (brands, device_models, material_categories) -- their
 * APIs previously had no permission check at all (any logged-in account,
 * any role, could view/edit/delete them), and their permission codes never
 * existed in the Permission catalog (scripts/seedSystemModules.ts's
 * ModuleDefinition list never covered them), so a Super Admin could never
 * grant "Brands" access to a custom role even after this fix ships code-side.
 *
 * Uses the same primitive the module-registry already relies on
 * (syncPermissionsForModule) to generate the standard view/create/edit/
 * delete/export/approve/manage_settings codes, refreshes SUPER_ADMIN's
 * display list (syncSuperAdminRole -- harmless; isSuperAdmin already
 * bypasses every check unconditionally), and grants AN_STAFF view+export
 * for the 3 new codes via $addToSet (non-destructive -- adds to its
 * existing permissions array, touches no other role).
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/backfillMastersPermissions.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Role from "../src/models/Role";
import { syncPermissionsForModule, syncSuperAdminRole } from "../src/core/access/permissionSync.service";
import { buildPermissionCode } from "../src/core/access/actions";

const NEW_MODULES = [
  { key: "brands", label: "Brands" },
  { key: "device_models", label: "Device Models" },
  { key: "material_categories", label: "Material Categories" },
];

async function main() {
  await connectDB();

  for (const m of NEW_MODULES) {
    await syncPermissionsForModule({ key: m.key, label: m.label, isSystem: true, applicableActions: undefined });
    console.log(`Synced Permission catalog rows for "${m.key}".`);
  }

  await syncSuperAdminRole();
  console.log("Refreshed SUPER_ADMIN's permissions display list.");

  const newCodes = NEW_MODULES.flatMap((m) => [
    buildPermissionCode(m.key, "view"),
    buildPermissionCode(m.key, "export"),
  ]);
  const result = await Role.updateOne(
    { code: "AN_STAFF", businessId: null, vendorId: null },
    { $addToSet: { permissions: { $each: newCodes } } }
  );
  console.log(`AN_STAFF: added ${newCodes.length} codes (matched ${result.matchedCount} role doc).`);

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
