/**
 * ONE-TIME SEED: platform-wide default roles that give every registration
 * path a non-blank floor role, plus the AN-side staff role.
 *
 * Run AFTER scripts/seedSystemModules.ts (needs Permission docs to already
 * exist for the modules referenced below). Safe to run more than once —
 * upserts by {code, businessId: null, vendorId: null}.
 *
 *   npx tsx --env-file=.env.local scripts/seedDefaultRoles.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Role, { RoleType, RoleStatus } from "../src/models/Role";
import { buildPermissionCode, STANDARD_ACTIONS } from "../src/core/access/actions";

const ALL_ACTION_KEYS = STANDARD_ACTIONS.map((a) => a.key);
const VIEW_APPROVE = ["view", "approve"];
const VIEW_CREATE = ["view", "create"];
const VIEW_ONLY = ["view"];

async function upsertGlobalRole(
  code: string,
  name: string,
  description: string,
  modules: string[],
  actions: string[]
) {
  const codes = modules.flatMap((m) => actions.map((a) => buildPermissionCode(m, a)));
  await Role.updateOne(
    { code, businessId: null, vendorId: null },
    {
      $setOnInsert: {
        code,
        name,
        description,
        type: RoleType.SYSTEM,
        status: RoleStatus.ACTIVE,
        isSystem: true,
        isProtected: true,
      },
      $set: { permissions: codes },
    },
    { upsert: true }
  );
  console.log(`  ${code}: ${codes.length} permission codes`);
}

async function main() {
  await connectDB();

  console.log("Seeding platform default roles...");

  // AN Admin Team: approval + view across every module, no edit/create/
  // delete/export/manage_settings. Deliberately a different code from the
  // legacy "ADMIN" bucket (syncSuperAdminRole's BASE_ROLES) since that one
  // is per-business/permissions-configured-separately, not this fixed
  // platform-wide staff role.
  //
  // Uses every module key currently known to the system, pulled live from
  // ModuleDefinition so it never goes stale as modules are added.
  const ModuleDefinition = (await import("../src/core/module-registry/ModuleDefinition.model")).default;
  const allModuleKeys: string[] = await ModuleDefinition.find({ businessId: null }).distinct("key");

  await upsertGlobalRole(
    "AN_ADMIN",
    "AN Admin",
    "Approval and view access across every module. No edit or delete.",
    allModuleKeys,
    VIEW_APPROVE
  );

  // Minimal self-registration floors -- every new shopnative/angroup user
  // gets exactly one of these, never nothing.
  await upsertGlobalRole(
    "CUSTOMER_SHOPNATIVE",
    "Shopnative Customer",
    "View and create access to their own orders only.",
    ["orders"],
    VIEW_CREATE
  );

  await upsertGlobalRole(
    "CUSTOMER_ANGROUP",
    "ANgroup Customer",
    "View-only access to their own profile.",
    ["users"],
    VIEW_ONLY
  );

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
