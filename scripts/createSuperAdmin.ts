/**
 * ONE-TIME BOOTSTRAP: create a named super-admin login.
 *
 * Context: every seed route (seed-crm-modules, seed-orphaned-modules) and
 * the SUPER_ADMIN-creation path in api/admin/users/route.ts all require an
 * existing super-admin session to call -- a genuine chicken-and-egg for
 * minting a NEW super admin who isn't the one already in the database
 * (raj@angroup.com). This script bypasses that via direct DB access, the
 * same pattern scripts/seedSystemModules.ts already uses.
 *
 * INSERT-ONLY, IDEMPOTENT: checks for an existing user by email first and
 * never overwrites or touches any other user -- per explicit instruction,
 * this must never delete or modify existing accounts, only add this one.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/createSuperAdmin.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import User from "../src/models/User";
import Role from "../src/models/Role";
import UserRole from "../src/models/UserRole";
import bcrypt from "bcryptjs";

const EMAIL = "nraj.k55@gmail.com";
const NAME = "Nagaraju (Super Admin)";
// Passed via env so the plaintext password never lives in this file or
// shell history beyond the one invocation that sets it.
const PASSWORD = process.env.NEW_SUPER_ADMIN_PASSWORD;

async function main() {
  if (!PASSWORD) {
    throw new Error("Set NEW_SUPER_ADMIN_PASSWORD in the environment before running this script.");
  }

  await connectDB();

  const existing = await User.findOne({ email: EMAIL });
  if (existing) {
    console.log(`User ${EMAIL} already exists (id ${existing._id}, role ${existing.role}) -- not touching it.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(PASSWORD, 12);

  const user = await User.create({
    name: NAME,
    email: EMAIL,
    password: hashedPassword,
    role: "SUPER_ADMIN",
    isActive: true,
    isEmailVerified: true,
    authProvider: "credentials",
  } as any);

  // Mirror the RBAC-chain bookkeeping api/admin/users/route.ts's POST does
  // for a SUPER_ADMIN, so this account is consistent with any other
  // super-admin created through the normal authenticated route.
  let roleDoc = await Role.findOne({ code: "SUPER_ADMIN" });
  if (!roleDoc) {
    roleDoc = await Role.create({
      name: "Super Admin",
      code: "SUPER_ADMIN",
      description: "Super Admin",
      isSystem: true,
    });
  }
  await UserRole.create({ userId: user._id, roleId: roleDoc._id });

  console.log(`Created super admin: ${EMAIL} (id ${user._id})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to create super admin:", err);
    process.exit(1);
  });
