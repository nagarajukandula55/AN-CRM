/**
 * ONE-TIME: repair the Role collection's indexes after the roleNumber
 * sparse-index bug found while running wipeToSuperAdminOnly.ts --
 * 1. Unsets roleNumber on any existing role where it's explicitly null
 *    (the old `default: null` put it there) so the sparse index actually
 *    treats those roles as "no roleNumber" rather than colliding.
 * 2. Drops any stale standalone unique index on `code` alone (a schema/DB
 *    drift leftover from before the {code,businessId,vendorId} compound
 *    index existed) via syncIndexes(), which reconciles the live indexes
 *    to exactly what Role.ts's schema declares now.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/fixRoleIndexes.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Role from "../src/models/Role";

async function main() {
  await connectDB();

  const unsetResult = await Role.updateMany({ roleNumber: null }, { $unset: { roleNumber: "" } });
  console.log(`Unset roleNumber on ${unsetResult.modifiedCount} role(s) that had it explicitly null.`);

  const before = await Role.collection.indexes();
  const dropped = await Role.syncIndexes();
  const after = await Role.collection.indexes();
  console.log(`Indexes: ${before.length} -> ${after.length}. Dropped:`, dropped);
  console.log(
    "Final indexes:",
    after.map((i: any) => `${i.name} ${JSON.stringify(i.key)}${i.unique ? " UNIQUE" : ""}${i.sparse ? " SPARSE" : ""}`)
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
