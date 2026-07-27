/**
 * BOOTSTRAP/RECOVERY: upsert the platform owner's "Admin" login.
 *
 * Unlike createSuperAdmin.ts (insert-only, different email), this targets
 * the OWNER account — the email rebuild-access/route.ts is hard-locked to —
 * and is an UPSERT: if the account exists it gets its password reset and
 * its SUPER_ADMIN role/flags repaired; if not, it's created. It touches no
 * other account.
 *
 * HOW TO RUN:
 *   NEW_ADMIN_PASSWORD='...' npx tsx --env-file=.env.local scripts/createAdminOwner.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import User from "../src/models/User";
import Role from "../src/models/Role";
import UserRole from "../src/models/UserRole";
import bcrypt from "bcryptjs";

// Must match OWNER_EMAIL in api/admin/maintenance/rebuild-access/route.ts,
// so this login can call the access-rebuild endpoint.
const EMAIL = "anenterprises9396@gmail.com";
const USERNAME = "admin"; // schema lowercases; login lowercases input, so "Admin" works too
const NAME = "Admin";
const PASSWORD = process.env.NEW_ADMIN_PASSWORD;

async function main() {
  if (!PASSWORD) {
    throw new Error("Set NEW_ADMIN_PASSWORD in the environment before running this script.");
  }

  await connectDB();

  const hashedPassword = await bcrypt.hash(PASSWORD, 12);

  let user = await User.findOne({ email: EMAIL }).select("+password");
  if (user) {
    user.set({
      name: NAME,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      isActive: true,
      isEmailVerified: true,
      mustChangePassword: false,
    });
    await user.save();
    console.log(`Updated existing owner account ${EMAIL} (id ${user._id}): password reset, SUPER_ADMIN ensured.`);
  } else {
    user = await User.create({
      name: NAME,
      email: EMAIL,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      isActive: true,
      isEmailVerified: true,
      mustChangePassword: false,
      authProvider: "credentials",
    } as any);
    console.log(`Created owner account ${EMAIL} (id ${user._id}).`);
  }

  // Username is sparse-unique — another account may already hold "admin".
  // Not fatal: email login still works, so report instead of throwing.
  const usernameHolder = await User.findOne({ username: USERNAME });
  if (usernameHolder && String(usernameHolder._id) !== String(user._id)) {
    console.warn(`Username "${USERNAME}" is taken by ${usernameHolder.email} — log in with the email instead.`);
  } else if (!usernameHolder) {
    user.set({ username: USERNAME });
    await user.save();
    console.log(`Username "${USERNAME}" assigned.`);
  }

  // RBAC chain, matching rebuild-access's platform-wide role shape.
  let roleDoc = await Role.findOne({ code: "SUPER_ADMIN", businessId: null, vendorId: null });
  if (!roleDoc) {
    roleDoc = await Role.create({
      name: "Super Admin",
      code: "SUPER_ADMIN",
      description: "Full, unconditional access to everything in the system.",
      isSystem: true,
      isProtected: true,
    });
  }
  await UserRole.updateOne(
    { userId: user._id, roleId: roleDoc._id },
    { $setOnInsert: { userId: user._id, roleId: roleDoc._id } },
    { upsert: true }
  );

  console.log("Done. Login: username \"Admin\" (or the email) + the password you set.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
