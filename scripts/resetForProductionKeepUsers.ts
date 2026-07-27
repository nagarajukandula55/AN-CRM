/**
 * PRODUCTION GO-LIVE RESET: empties every business/transactional collection
 * in the database for a clean start, EXCEPT the system configuration
 * collections that must survive (module registry, permissions, SSO source
 * mappings, pincode reference data) and two named User accounts you keep
 * logging in with. Also wipes NumberSequence (the numbering engine's atomic
 * counters) so every document-number series (vendor IDs, invoice numbers,
 * etc.) restarts fresh from its configured startFrom the next time one is
 * generated, instead of continuing from wherever it left off.
 *
 * Unlike scripts/fullDatabaseReset.ts (which deletes ALL users and creates
 * one brand-new "admin" account), this KEEPS the two specific accounts you
 * name below so you don't get locked out and don't have to re-share new
 * credentials.
 *
 * Enumerates collections dynamically (not a hand-maintained model list) so
 * nothing gets missed as the schema grows.
 *
 * Dry-run by default (counts only, writes nothing). Pass --confirm to
 * actually wipe.
 *
 *   npx tsx --env-file=.env.local scripts/resetForProductionKeepUsers.ts
 *   npx tsx --env-file=.env.local scripts/resetForProductionKeepUsers.ts --confirm
 *
 * TAKE A DATABASE BACKUP BEFORE RUNNING WITH --confirm. This is irreversible.
 */

import mongoose from "mongoose";
import { connectDB } from "../src/core/db/mongodb";
import User from "../src/models/User";
import UserRole from "../src/models/UserRole";

const CONFIRM = process.argv.includes("--confirm");

// The two accounts to keep -- edit this list if the usernames differ from
// what you actually have. Matched case-insensitively against `username`.
const KEEP_USERNAMES = ["testuser", "admin"];

// Collections that hold system/platform configuration, not business data --
// these survive the wipe untouched.
const KEEP_COLLECTIONS = new Set([
  "moduledefinitions",
  "permissions",
  "ssosourcemappings",
  // India pincode->state/city reference directory (scripts/seedPincodes.ts)
  // -- static platform reference data, not business data.
  "pincodeentries",
  "pincodedatasetmetas",
]);

// Platform-wide roles (businessId: null, vendorId: null) survive; every
// business/vendor-scoped role gets wiped along with the businesses/vendors
// themselves. `roles`, `userroles`, and `users` are handled specially below
// rather than via KEEP_COLLECTIONS since they're a partial keep, not
// all-or-nothing.

async function main() {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("No active database connection");

  const keepUsers = await User.find({
    username: { $in: KEEP_USERNAMES.map((u) => u.toLowerCase()) },
    isDeleted: { $ne: true },
  })
    .select("_id username email name")
    .lean();

  console.log(`Users to KEEP (matched ${keepUsers.length} of ${KEEP_USERNAMES.length} requested):`);
  for (const u of keepUsers) {
    console.log(`  - ${(u as any).username} (${(u as any).email}) — ${(u as any).name}`);
  }
  const missing = KEEP_USERNAMES.filter(
    (u) => !keepUsers.some((k: any) => k.username?.toLowerCase() === u.toLowerCase())
  );
  if (missing.length > 0) {
    console.log(`\n⚠️  Could not find a User with username: ${missing.join(", ")}`);
    console.log("   Double check the usernames in KEEP_USERNAMES above match what's actually in the database.");
    if (CONFIRM) {
      console.log("\nAborting -- fix KEEP_USERNAMES and re-run before using --confirm.");
      process.exit(1);
    }
  }
  const keepUserIds = keepUsers.map((u: any) => u._id);

  const collections = await db.listCollections().toArray();
  console.log(`\nFound ${collections.length} collections.\n`);

  const plan: { name: string; action: string; count: number }[] = [];

  for (const { name } of collections) {
    if (KEEP_COLLECTIONS.has(name)) {
      plan.push({ name, action: "KEEP (system config)", count: await db.collection(name).countDocuments() });
      continue;
    }
    if (name === "roles") {
      const count = await db.collection(name).countDocuments({
        $or: [{ businessId: { $ne: null } }, { vendorId: { $ne: null } }],
      });
      plan.push({ name, action: "DELETE vendor/business-scoped roles only", count });
      continue;
    }
    if (name === "userroles") {
      const count = await db.collection(name).countDocuments({ userId: { $nin: keepUserIds } });
      plan.push({ name, action: `DELETE all except the ${keepUserIds.length} kept user(s)`, count });
      continue;
    }
    if (name === "users") {
      const count = await db.collection(name).countDocuments({ _id: { $nin: keepUserIds } });
      plan.push({ name, action: `DELETE all except the ${keepUserIds.length} kept user(s)`, count });
      continue;
    }
    const count = await db.collection(name).countDocuments();
    plan.push({ name, action: "DELETE ALL", count });
  }

  for (const p of plan) {
    console.log(`  ${p.name.padEnd(30)} ${p.action.padEnd(48)} ${p.count}`);
  }

  if (!CONFIRM) {
    console.log("\nDry run only -- re-run with --confirm to actually wipe.");
    process.exit(0);
  }

  if (missing.length > 0) {
    // Already aborted above, but double-guard in case this branch is ever
    // reordered -- never wipe production data with a badly-configured
    // KEEP_USERNAMES list.
    throw new Error("Refusing to wipe: not all KEEP_USERNAMES were found.");
  }

  for (const { name } of collections) {
    if (KEEP_COLLECTIONS.has(name)) continue;
    if (name === "roles") {
      await db.collection(name).deleteMany({
        $or: [{ businessId: { $ne: null } }, { vendorId: { $ne: null } }],
      });
      continue;
    }
    if (name === "userroles") {
      await db.collection(name).deleteMany({ userId: { $nin: keepUserIds } });
      continue;
    }
    if (name === "users") {
      await db.collection(name).deleteMany({ _id: { $nin: keepUserIds } });
      continue;
    }
    await db.collection(name).deleteMany({});
  }

  console.log("\nDone. All business/transactional data wiped.");
  console.log(`Kept ${keepUsers.length} user(s): ${keepUsers.map((u: any) => u.username).join(", ")}`);
  console.log("Numbering counters (NumberSequence) were also cleared -- the next document created of");
  console.log("each type will restart its serial from that document type's configured startFrom.");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
