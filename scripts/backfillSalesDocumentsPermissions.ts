/**
 * ONE-TIME: backfill the Permission catalog for the new "sales_documents"
 * module (Quotations/Delivery Challans/Credit Notes/Debit Notes/Proforma
 * Invoices — see models/SalesDocument.ts), same pattern as
 * backfillMastersPermissions.ts: generate the standard action codes, refresh
 * SUPER_ADMIN's display list, grant AN_STAFF view+export non-destructively.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/backfillSalesDocumentsPermissions.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Role from "../src/models/Role";
import { syncPermissionsForModule, syncSuperAdminRole } from "../src/core/access/permissionSync.service";
import { buildPermissionCode } from "../src/core/access/actions";

async function main() {
  await connectDB();

  await syncPermissionsForModule({
    key: "sales_documents",
    label: "Quotations / Challans / Credit & Debit Notes",
    isSystem: true,
    applicableActions: undefined,
  });
  console.log('Synced Permission catalog rows for "sales_documents".');

  await syncSuperAdminRole();
  console.log("Refreshed SUPER_ADMIN's permissions display list.");

  const newCodes = [buildPermissionCode("sales_documents", "view"), buildPermissionCode("sales_documents", "export")];
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
