/**
 * One-time cleanup for the bug fixed in models/Business.ts: any Business
 * document with brandShortcut stored as an empty string (instead of
 * unset) fails minlength validation on EVERY future .save() of that
 * document, regardless of which field is actually being changed -- this
 * is what broke the Telegram /link flow ("Business validation failed:
 * brandShortcut ... is shorter than the minimum allowed length (2)").
 *
 * Uses the raw MongoDB driver, not the Mongoose model -- the model's own
 * brandShortcut setter (added alongside this script, normalizes '' to
 * undefined on assignment) also applies to query filter casting, which
 * silently turned a Mongoose-based `find({brandShortcut: ""})` into a
 * no-op match against nothing. The raw driver has no such transform, so
 * it sees exactly what's on disk.
 *
 *   npx tsx --env-file=.env.local scripts/fixEmptyBrandShortcuts.ts          (dry run)
 *   npx tsx --env-file=.env.local scripts/fixEmptyBrandShortcuts.ts --confirm (writes)
 */
import { MongoClient } from "mongodb";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  const client = new MongoClient(uri);
  await client.connect();

  const confirm = process.argv.includes("--confirm");
  const collection = client.db().collection("businesses");
  const affected = await collection.find({ brandShortcut: "" }).project({ name: 1, businessCode: 1 }).toArray();

  if (affected.length === 0) {
    console.log("No businesses with an empty-string brandShortcut found. Nothing to do.");
  } else {
    console.log(`Found ${affected.length} business(es) with brandShortcut: ''`);
    for (const b of affected) console.log(`  - ${b.name} (${b.businessCode}) [${b._id}]`);

    if (confirm) {
      const result = await collection.updateMany({ brandShortcut: "" }, { $unset: { brandShortcut: "" } });
      console.log(`\nFixed ${result.modifiedCount} document(s).`);
    } else {
      console.log("\nDry run only -- re-run with --confirm to actually fix these.");
    }
  }

  await client.close();
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
