/**
 * ONE-TIME BOOTSTRAP: create a super-admin login with username "admin" /
 * password "admin", per explicit request, for managing all businesses and
 * vendors. INSERT-ONLY, IDEMPOTENT -- checks for an existing user by
 * username first and never overwrites or touches any other user, same
 * convention as scripts/createSuperAdmin.ts.
 *
 * SECURITY WARNING: "admin"/"admin" is a trivially guessable credential on
 * a login that controls every business and vendor on the platform. Change
 * this password immediately after first login (Profile > Change Password)
 * -- this script only exists to get one working login fast, not as a
 * credential meant to stay in place.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/createDefaultSuperAdmin.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import User from "../src/models/User";
import Role from "../src/models/Role";
import UserRole from "../src/models/UserRole";
import bcrypt from "bcryptjs";

const USERNAME = "admin";
const EMAIL = "admin@an-crm.local";
const PASSWORD = "admin";
const NAME = "Super Admin";

async function main() {
  await connectDB();

  const existing = await User.findOne({ $or: [{ username: USERNAME }, { email: EMAIL }] });
  if (existing) {
    console.log(`User ${USERNAME}/${EMAIL} already exists (id ${existing._id}, role ${existing.role}) -- not touching it.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(PASSWORD, 12);

  const user = await User.create({
    name: NAME,
    email: EMAIL,
    username: USERNAME,
    password: hashedPassword,
    role: "SUPER_ADMIN",
    isActive: true,
    isEmailVerified: true,
    authProvider: "credentials",
  } as any);

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

  console.log(`Created super admin: username=${USERNAME} email=${EMAIL} (id ${user._id})`);
  console.log(`Log in with username "${USERNAME}" and password "${PASSWORD}" -- CHANGE THIS PASSWORD IMMEDIATELY.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to create super admin:", err);
    process.exit(1);
  });
