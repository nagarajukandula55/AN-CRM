/**
 * FULL DATABASE RESET for a clean go-live: empties every collection in
 * AN-CRM's database EXCEPT platform-wide system config (Permission, and
 * Role/RolePermission/UserRole rows that aren't scoped to a specific
 * business or vendor). Then recreates exactly one User: a Super Admin
 * with username "admin".
 *
 * This file previously was a stray copy of ANgroup's own identically-named
 * script (wrong email domain, referenced collections -- moduledefinitions,
 * ssosourcemappings, pincodeentries -- that don't exist in AN-CRM's schema
 * at all) -- fixed to actually match this app.
 *
 * Enumerates collections dynamically (not a hand-maintained model list) so
 * nothing gets missed as the schema grows.
 *
 * Dry-run by default (counts only, writes nothing). Pass --confirm to
 * actually wipe.
 *
 *   npx tsx --env-file=.env.local scripts/fullDatabaseReset.ts
 *   npx tsx --env-file=.env.local scripts/fullDatabaseReset.ts --confirm
 *
 * TAKE A DATABASE BACKUP BEFORE RUNNING WITH --confirm. This is irreversible.
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "../src/lib/mongodb";
import User from "../src/models/User";
import Role from "../src/models/Role";
import UserRole from "../src/models/UserRole";

const CONFIRM = process.argv.includes("--confirm");

// Collections that hold system/platform configuration, not business data --
// these survive the wipe untouched.
const KEEP_COLLECTIONS = new Set(["permissions"]);

function generatePassword(): string {
  return require("crypto").randomBytes(9).toString("base64url");
}

async function main() {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("No active database connection");

  const collections = await db.listCollections().toArray();

  console.log(`Found ${collections.length} collections.\n`);

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
    if (name === "userroles" || name === "users") {
      const count = await db.collection(name).countDocuments();
      plan.push({ name, action: "DELETE ALL (recreated: 1 Super Admin)", count });
      continue;
    }
    const count = await db.collection(name).countDocuments();
    plan.push({ name, action: "DELETE ALL", count });
  }

  for (const p of plan) {
    console.log(`  ${p.name.padEnd(30)} ${p.action.padEnd(40)} ${p.count}`);
  }

  if (!CONFIRM) {
    console.log("\nDry run only -- re-run with --confirm to actually wipe.");
    process.exit(0);
  }

  for (const { name } of collections) {
    if (KEEP_COLLECTIONS.has(name)) continue;
    if (name === "roles") {
      await db.collection(name).deleteMany({
        $or: [{ businessId: { $ne: null } }, { vendorId: { $ne: null } }],
      });
      continue;
    }
    await db.collection(name).deleteMany({});
  }

  console.log("\nAll business/user data wiped. Creating Super Admin...");

  const password = generatePassword();
  const hashed = await bcrypt.hash(password, 12);

  const superAdmin = await User.create({
    name: "Super Admin",
    email: "admin@an-crm.local",
    username: "admin",
    password: hashed,
    role: "SUPER_ADMIN",
    isActive: true,
    isEmailVerified: true,
    authProvider: "credentials",
  } as any);

  const superAdminRole = await Role.findOne({ code: "SUPER_ADMIN", businessId: null, vendorId: null });
  if (superAdminRole) {
    await UserRole.create({ userId: superAdmin._id, roleId: superAdminRole._id });
  } else {
    console.warn("No platform-wide SUPER_ADMIN role found -- created the user but could not attach a role. Check role seeding.");
  }

  console.log("\n=== SUPER ADMIN CREDENTIALS (shown once) ===");
  console.log(`  Username: admin`);
  console.log(`  Password: ${password}`);
  console.log("Save this now -- it will not be shown again. Change it after first login.");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
