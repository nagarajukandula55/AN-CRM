/**
 * One-time backfill: pushes every EXISTING User document into central-api's
 * shared "users" dataset.
 *
 * SECURITY: reuses User.ts's own exported buildCentralApiPayload() -- the
 * same whitelist the live dual-write sync uses -- rather than doc.toObject().
 * Never sync password/resetPasswordTokenHash/resetPasswordExpires/
 * sessionVersion/failedLoginAttempts/lockUntil/mustChangePassword. See
 * User.ts's own comment for the full reasoning.
 *
 * Safe to re-run: syncRecordToCentralApi() looks up each record by its
 * sourceId first and PUTs (updates) if it already exists there.
 *
 * Dry-run by default. Pass --confirm to actually push to central-api.
 *
 *   npx tsx --env-file=.env.local scripts/backfillCentralApiUsers.ts
 *   npx tsx --env-file=.env.local scripts/backfillCentralApiUsers.ts --confirm
 */

import { connectDB } from "../src/core/db/mongodb";
import User, { buildCentralApiPayload } from "../src/models/User";
import { syncRecordToCentralApi } from "../src/lib/centralApiSync";

const CONFIRM = process.argv.includes("--confirm");
const BATCH_SIZE = 200;

async function main() {
  if (!process.env.CENTRAL_API_URL) {
    console.error("CENTRAL_API_URL is not set — nothing to backfill against. Aborting.");
    process.exit(1);
  }

  await connectDB();

  const total = await User.countDocuments({});
  console.log(`\nUsers: ${total} document(s) found.`);

  if (total === 0) process.exit(0);

  if (!CONFIRM) {
    const sample = await User.find({}).limit(5);
    for (const doc of sample) {
      console.log(`  [dry-run] would sync ${doc._id} (${doc.name || doc.email})`);
    }
    if (total > 5) console.log(`  [dry-run] ...and ${total - 5} more`);
    console.log(`\n${total} would be synced (dry-run, no secrets included). Re-run with --confirm to actually sync.`);
    process.exit(0);
  }

  let synced = 0;
  let failed = 0;
  const cursor = User.find({}).batchSize(BATCH_SIZE).cursor();
  for await (const doc of cursor) {
    try {
      await syncRecordToCentralApi("users", doc._id.toString(), await buildCentralApiPayload(doc));
      synced += 1;
      if (synced % BATCH_SIZE === 0) console.log(`  ...${synced}/${total} synced`);
    } catch (err: any) {
      failed += 1;
      console.error(`  FAILED to sync user ${doc._id}:`, err?.message || err);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Users: ${synced} synced, ${failed} failed`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
