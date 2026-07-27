/**
 * ONE-TIME: remove exact-duplicate ModuleDefinition rows discovered while
 * auditing the sidebar/permission key mess -- three snake_case rows that
 * duplicate an existing, already-correct kebab-case row pointing at the
 * SAME route (both were independently seeded at different times, e.g. via
 * api/admin/seed-orphaned-modules, without checking for an existing row):
 *
 *   stock_adjustments  (dup of stock-adjustments,  /admin/stock-adjustments)
 *   stock_transfers    (dup of stock-transfers,    /admin/stock-transfers)
 *   vendor_products    (dup of vendor-products,    /admin/vendor-products)
 *
 * Verified via scripts/_listModuleDefs (ad-hoc, not committed) that these
 * are true duplicates -- same route/label as an existing row, not a
 * distinct feature -- unlike several other snake_case-keyed rows
 * (hr_leave, purchase_orders, document_numbers, etc.) which have no kebab
 * counterpart and are handled instead via moduleKeyAliases.ts additions.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/cleanDuplicateModuleDefinitions.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import ModuleDefinition from "../src/core/module-registry/ModuleDefinition.model";

const DUPLICATE_KEYS = ["stock_adjustments", "stock_transfers", "vendor_products"];

async function main() {
  await connectDB();

  for (const key of DUPLICATE_KEYS) {
    const result = await ModuleDefinition.deleteMany({ key, businessId: null });
    console.log(`Deleted ${result.deletedCount} row(s) for key "${key}".`);
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
