/**
 * One-time cleanup for the bug fixed in models/Business.ts: any Business
 * document with brandShortcut stored as an empty string (instead of
 * unset) fails minlength validation on EVERY future .save() of that
 * document, regardless of which field is actually being changed -- this
 * is what broke the Telegram /link flow ("Business validation failed:
 * brandShortcut ... is shorter than the minimum allowed length (2)").
 * $unset bypasses Mongoose validation entirely (a raw driver update, not
 * a .save()), so it can actually remove the bad value without hitting the
 * same validation error trying to fix it.
 *
 *   npx tsx --env-file=.env.local scripts/fixEmptyBrandShortcuts.ts          (dry run)
 *   npx tsx --env-file=.env.local scripts/fixEmptyBrandShortcuts.ts --confirm (writes)
 */
import mongoose from "mongoose";
import Business from "../src/models/Business";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  await mongoose.connect(uri);

  const confirm = process.argv.includes("--confirm");
  const affected = await Business.find({ brandShortcut: "" }).select("name businessCode");

  if (affected.length === 0) {
    console.log("No businesses with an empty-string brandShortcut found. Nothing to do.");
  } else {
    console.log(`Found ${affected.length} business(es) with brandShortcut: ''`);
    for (const b of affected) console.log(`  - ${b.name} (${b.businessCode})`);

    if (confirm) {
      const result = await Business.updateMany({ brandShortcut: "" }, { $unset: { brandShortcut: "" } });
      console.log(`\nFixed ${result.modifiedCount} document(s).`);
    } else {
      console.log("\nDry run only -- re-run with --confirm to actually fix these.");
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
