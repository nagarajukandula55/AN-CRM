/**
 * FULL DATABASE RESET for a clean go-live: empties every collection in the
 * database EXCEPT the system configuration collections that must survive
 * (module registry, permissions, SSO source mappings, and the platform-wide
 * roles like SUPER_ADMIN/AN_ADMIN/CUSTOMER_*). Then recreates exactly one
 * User: a Super Admin with username "admin".
 *
 * Enumerates collections dynamically (not a hand-maintained model list) so
 * nothing gets missed as the schema grows.
 *
 * Dry-run by default (counts only, writes nothing). Pass --confirm to
 * actually wipe.
 *
 *   npx tsx --env-file=.env.local scripts/fullDatabaseReset.ts
 *   npx tsx --env-file=.env.local scripts/fullDatabaseReset.ts --confirm
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "../src/core/db/mongodb";
import User from "../src/models/User";
import Role from "../src/models/Role";
import UserRole from "../src/models/UserRole";

const CONFIRM = process.argv.includes("--confirm");

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
// themselves. `roles` and `userroles` are handled specially below rather
// than via KEEP_COLLECTIONS since they're a partial keep, not all-or-nothing.
const PARTIAL_COLLECTIONS = new Set(["roles", "userroles", "users"]);

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
    email: "admin@angroup.local",
    username: "admin",
    password: hashed,
    role: "SUPER_ADMIN",
    isActive: true,
    isEmailVerified: true,
    authProvider: "credentials",
    mustChangePassword: true,
  } as any);

  const superAdminRole = await Role.findOne({ code: "SUPER_ADMIN", businessId: null, vendorId: null });
  if (!superAdminRole) {
    throw new Error("SUPER_ADMIN role not found -- run scripts/seedSystemModules.ts first to seed it.");
  }
  await UserRole.create({ userId: superAdmin._id, roleId: superAdminRole._id });

  console.log("\n=== SUPER ADMIN CREDENTIALS (shown once) ===");
  console.log(`  User ID:  admin`);
  console.log(`  Password: ${password}`);
  console.log("You must change this password on first login (mustChangePassword is set).");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
