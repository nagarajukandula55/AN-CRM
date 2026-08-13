/**
 * Backfills the new `vendorId` field on existing documents in the
 * phase-1 models (CrmJobSheet, Inventory, StockLedger,
 * StockTransfer, StockAdjustment, InventoryTransaction, InventoryLot,
 * SalesDocument, Notification) that predate the businessId ->
 * vendorId isolation fix. See the plan this backfill implements:
 * .claude/plans/steady-knitting-stardust.md (Step 5).
 *
 * Resolution strategy per document: look up the `createdBy`/`assignedTo`
 * user's own VendorProfile (owner, via userId) or, failing that, their
 * BusinessMember row's `vendorId` (staff linked to a vendor). Documents
 * where neither resolves (a business-level staff/owner action with no
 * vendor link) are intentionally left with `vendorId: null` -- they stay
 * visible business-wide, which is correct, not a gap.
 *
 * Dry-run by default (prints counts only, writes nothing). Pass --confirm
 * to actually write.
 *
 *   npx tsx --env-file=.env.local scripts/backfillVendorId.ts
 *   npx tsx --env-file=.env.local scripts/backfillVendorId.ts --confirm
 */

import { connectDB } from "../src/core/db/mongodb";
import VendorProfile from "../src/models/VendorProfile";
import BusinessMember from "../src/models/BusinessMember";
import CrmJobSheet from "../src/models/CrmJobSheet";
import Inventory from "../src/models/Inventory";
import StockLedger from "../src/models/StockLedger";
import StockTransfer from "../src/models/StockTransfer";
import StockAdjustment from "../src/models/StockAdjustment";
import InventoryTransaction from "../src/models/InventoryTransaction";
import InventoryLot from "../src/models/InventoryLot";
import SalesDocument from "../src/models/SalesDocument";
import Notification from "../src/models/Notification";

const CONFIRM = process.argv.includes("--confirm");

// Each model + which field on its documents identifies the acting user,
// so we can resolve that user's own vendorId. `null` means "no reliable
// user field to key off" -- those models are reported but skipped.
const TARGETS: { name: string; model: any; userField: string | null }[] = [
  { name: "CrmJobSheet", model: CrmJobSheet, userField: "createdBy" },
  { name: "Inventory", model: Inventory, userField: null },
  { name: "StockLedger", model: StockLedger, userField: "createdBy" },
  { name: "StockTransfer", model: StockTransfer, userField: "createdBy" },
  { name: "StockAdjustment", model: StockAdjustment, userField: "createdBy" },
  { name: "InventoryTransaction", model: InventoryTransaction, userField: "createdBy" },
  { name: "InventoryLot", model: InventoryLot, userField: null },
  { name: "SalesDocument", model: SalesDocument, userField: "createdBy" },
  { name: "Notification", model: Notification, userField: "userId" },
];

async function resolveVendorIdForUser(
  userId: string | null | undefined,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (!userId) return null;
  const key = String(userId);
  if (cache.has(key)) return cache.get(key)!;

  let vendorId: string | null = null;
  const owned = await VendorProfile.findOne({ userId: key, isDeleted: { $ne: true } })
    .select("_id")
    .lean<any>();
  if (owned) {
    vendorId = String(owned._id);
  } else {
    const membership = await BusinessMember.findOne({
      userId: key,
      vendorId: { $ne: null },
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .select("vendorId")
      .lean<any>();
    if (membership?.vendorId) vendorId = String(membership.vendorId);
  }

  cache.set(key, vendorId);
  return vendorId;
}

async function main() {
  await connectDB();
  const userVendorCache = new Map<string, string | null>();

  for (const target of TARGETS) {
    const total = await target.model.countDocuments({
      $or: [{ vendorId: { $exists: false } }, { vendorId: null }],
    });

    if (!target.userField) {
      console.log(`${target.name}: ${total} document(s) with no vendorId, no user field to resolve from -- SKIPPED (stays business-wide).`);
      continue;
    }

    const docs: any[] = await (target.model as any)
      .find({ $or: [{ vendorId: { $exists: false } }, { vendorId: null }] })
      .select(`_id ${target.userField}`)
      .lean();

    let resolved = 0;
    let unresolved = 0;
    const writes: { _id: any; vendorId: string }[] = [];

    for (const doc of docs) {
      const actingUserId = doc[target.userField!];
      const vendorId = await resolveVendorIdForUser(actingUserId, userVendorCache);
      if (vendorId) {
        resolved++;
        writes.push({ _id: doc._id, vendorId });
      } else {
        unresolved++;
      }
    }

    console.log(
      `${target.name}: ${total} total unset, ${resolved} resolvable to a vendor, ${unresolved} stay business-wide (no vendor link on the acting user).`
    );

    if (CONFIRM && writes.length > 0) {
      const bulkOps = writes.map((w) => ({
        updateOne: { filter: { _id: w._id }, update: { $set: { vendorId: w.vendorId } } },
      }));
      const result = await target.model.bulkWrite(bulkOps);
      console.log(`  -> wrote ${result.modifiedCount} document(s).`);
    }
  }

  if (!CONFIRM) {
    console.log("\nDry run only -- re-run with --confirm to write these vendorId values.");
  } else {
    console.log("\nDone.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
