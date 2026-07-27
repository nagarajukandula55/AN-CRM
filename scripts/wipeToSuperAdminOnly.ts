/**
 * ONE-TIME, CONFIRMED-DESTRUCTIVE: delete every Role in the system except
 * SUPER_ADMIN, per explicit direction: "remove all roles in system only
 * keep Super Admin and let create roles for every business individually
 * and manage them." Unlike the earlier rebuild-access route (which also
 * preserved AN_STAFF + the CUSTOMER floor codes), this keeps literally
 * only SUPER_ADMIN.
 *
 * What it does, in order:
 *  1. Ensures SUPER_ADMIN exists (businessId/vendorId null, isSystem/
 *     isProtected true) -- creates it if somehow missing, never touches it
 *     if present.
 *  2. Deletes every OTHER Role document, and every UserRole pointing at a
 *     deleted role. This intentionally does NOT regenerate the structural
 *     Owner/Manager role pair for existing vendors -- per explicit
 *     direction to stop auto-generating vendor default roles entirely.
 *     Vendor logins self-heal those two roles the next time the vendor's
 *     own finalize/staff-page flow runs; until then a vendor with no
 *     other role is left with none, matching "nothing survives but
 *     SUPER_ADMIN" literally.
 *  3. Deactivates any account left holding zero roles after the wipe
 *     (standing direction from the earlier rebuild-access pass: no
 *     account may sit around with no role) -- excludes whoever still
 *     holds SUPER_ADMIN, naturally, since that role survives.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/wipeToSuperAdminOnly.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Role, { RoleStatus, RoleType } from "../src/models/Role";
import UserRole from "../src/models/UserRole";
import User from "../src/models/User";

async function main() {
  await connectDB();

  let superAdmin = await Role.findOne({ code: "SUPER_ADMIN", businessId: null, vendorId: null });
  if (!superAdmin) {
    superAdmin = await Role.create({
      code: "SUPER_ADMIN",
      name: "Super Admin",
      description: "Full, unconditional access to everything in the system.",
      permissions: [],
      businessId: null,
      vendorId: null,
      type: RoleType.SYSTEM,
      status: RoleStatus.ACTIVE,
      isSystem: true,
      isProtected: true,
    });
    console.log("SUPER_ADMIN role did not exist -- created it.");
  } else {
    console.log(`SUPER_ADMIN role already exists (id ${superAdmin._id}) -- left untouched.`);
  }

  const wipeResult = await Role.deleteMany({ _id: { $ne: superAdmin._id } });
  const orphanResult = await UserRole.deleteMany({ roleId: { $ne: superAdmin._id } });
  console.log(`Deleted ${wipeResult.deletedCount} role(s), ${orphanResult.deletedCount} user-role grant(s).`);

  const usersWithRoles = await UserRole.distinct("userId");
  const deactivateResult = await User.updateMany(
    { _id: { $nin: usersWithRoles }, isDeleted: { $ne: true } },
    { $set: { isActive: false } }
  );
  console.log(`Deactivated ${deactivateResult.modifiedCount} zero-role account(s).`);

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
