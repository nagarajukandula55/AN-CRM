/**
 * One-time backfill: pushes every EXISTING Customer and Subscription
 * document into central-api's shared "customers"/"subscriptions" datasets.
 *
 * The dual-write sync added in src/models/Customer.ts and
 * src/models/Subscription.ts (see src/lib/centralApiSync.ts) only fires on
 * save()/findOneAndUpdate()/insertMany() going forward -- any record
 * created before that shipped, and never resaved since, was never pushed to
 * central-api. GET /api/customers (src/lib/centralApiRead.ts) would
 * silently be missing that older data, and central-api would have no
 * subscription/start-date/end-date history for existing vendors and
 * sub-vendors, until this backfill runs once.
 *
 * Safe to re-run: syncRecordToCentralApi() looks up each record by its
 * sourceId first and PUTs (updates) if it already exists there, so running
 * this twice just re-syncs the same records rather than duplicating them.
 *
 * Dry-run by default (prints what it WOULD sync, writes nothing). Pass
 * --confirm to actually push to central-api.
 *
 *   npx tsx --env-file=.env.local scripts/backfillCentralApiCustomerSubscription.ts
 *   npx tsx --env-file=.env.local scripts/backfillCentralApiCustomerSubscription.ts --confirm
 */

import { connectDB } from "../src/core/db/mongodb";
import Customer from "../src/models/Customer";
import Subscription from "../src/models/Subscription";
import { syncRecordToCentralApi } from "../src/lib/centralApiSync";

const CONFIRM = process.argv.includes("--confirm");
const BATCH_SIZE = 200;

// Customer counts can run much higher than Subscription ever will (one
// business/vendor typically has many customers but a handful of
// subscription rows) - streamed via cursor rather than loaded into memory
// all at once.
async function backfillCustomers() {
  const total = await Customer.countDocuments({});
  console.log(`\nCustomers: ${total} document(s) found.`);
  if (total === 0) return { synced: 0, failed: 0 };

  if (!CONFIRM) {
    const sample = await Customer.find({}).limit(5);
    for (const doc of sample) {
      console.log(`  [dry-run] would sync ${doc._id} (${doc.name || "unnamed"})`);
    }
    if (total > 5) console.log(`  [dry-run] ...and ${total - 5} more`);
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;
  const cursor = Customer.find({}).batchSize(BATCH_SIZE).cursor();
  for await (const doc of cursor) {
    try {
      await syncRecordToCentralApi("customers", doc._id.toString(), doc.toObject());
      synced += 1;
      if (synced % BATCH_SIZE === 0) console.log(`  ...${synced}/${total} synced`);
    } catch (err: any) {
      failed += 1;
      console.error(`  FAILED to sync customer ${doc._id}:`, err?.message || err);
    }
  }
  return { synced, failed };
}

async function backfillSubscriptions() {
  const docs = await Subscription.find({});
  console.log(`\nSubscriptions: ${docs.length} document(s) found.`);
  if (docs.length === 0) return { synced: 0, failed: 0 };

  if (!CONFIRM) {
    for (const doc of docs.slice(0, 5)) {
      console.log(`  [dry-run] would sync ${doc._id} (plan=${doc.plan}, status=${doc.status})`);
    }
    if (docs.length > 5) console.log(`  [dry-run] ...and ${docs.length - 5} more`);
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;
  for (const doc of docs) {
    try {
      await syncRecordToCentralApi("subscriptions", doc._id.toString(), doc.toObject());
      synced += 1;
    } catch (err: any) {
      failed += 1;
      console.error(`  FAILED to sync subscription ${doc._id}:`, err?.message || err);
    }
  }
  return { synced, failed };
}

async function main() {
  if (!process.env.CENTRAL_API_URL) {
    console.error("CENTRAL_API_URL is not set — nothing to backfill against. Aborting.");
    process.exit(1);
  }

  await connectDB();

  const customerResult = await backfillCustomers();
  const subscriptionResult = await backfillSubscriptions();

  console.log("\n--- Summary ---");
  if (CONFIRM) {
    console.log(`Customers:     ${customerResult.synced} synced, ${customerResult.failed} failed`);
    console.log(`Subscriptions: ${subscriptionResult.synced} synced, ${subscriptionResult.failed} failed`);
  } else {
    console.log("Dry-run only — nothing was written. Re-run with --confirm to actually sync.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
