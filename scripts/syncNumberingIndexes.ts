/**
 * ONE-TIME: reconcile MongoDB indexes with the schema changes that scoped
 * several document-number fields (invoiceNumber, poNumber, grnNumber,
 * orderNumber, batchNumber, adjustmentNumber, transferNumber, employeeId)
 * from a GLOBAL unique constraint to a per-business {businessId, field}
 * compound unique constraint -- see each model file's own comment for why
 * (two businesses on the same default numbering prefix would otherwise
 * collide on the very first document, blocking onboarding new businesses).
 *
 * Safe by construction: the OLD constraint (globally unique) is strictly
 * stronger than the NEW one (unique per business), so no existing data can
 * violate the new compound index -- this is a mechanical index swap, not a
 * data migration.
 *
 * Model.syncIndexes() drops any DB index not declared in the current
 * schema and creates any declared index missing from the DB -- exactly
 * "make the database match the code" for these 8 models.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/syncNumberingIndexes.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import SalesInvoice from "../src/models/SalesInvoice";
import PurchaseOrder from "../src/models/PurchaseOrder";
import GoodsReceipt from "../src/models/GoodsReceipt";
import ProductionOrder from "../src/models/ProductionOrder";
import ProductionBatch from "../src/models/ProductionBatch";
import StockAdjustment from "../src/models/StockAdjustment";
import StockTransfer from "../src/models/StockTransfer";
import EmployeeProfile from "../src/models/EmployeeProfile";

const MODELS = [
  SalesInvoice,
  PurchaseOrder,
  GoodsReceipt,
  ProductionOrder,
  ProductionBatch,
  StockAdjustment,
  StockTransfer,
  EmployeeProfile,
] as any[];

async function main() {
  await connectDB();

  for (const model of MODELS) {
    const before = await model.collection.indexes();
    const result = await model.syncIndexes();
    const after = await model.collection.indexes();
    console.log(`${model.modelName}: ${before.length} -> ${after.length} indexes. syncIndexes() result:`, result);
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
