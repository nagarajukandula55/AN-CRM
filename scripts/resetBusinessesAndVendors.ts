/**
 * Wipes all Business/Vendor test data for a clean go-live: every Business,
 * VendorProfile, BusinessMember, and vendor-scoped Role/UserRole document.
 * Does NOT touch Users -- delete those yourself via the delete button on
 * the admin Users page first.
 *
 * Dry-run by default (counts only, writes nothing). Pass --confirm to
 * actually delete. Run this ONLY after the new registration/vendor-approval/
 * promotion flows have been tested end-to-end -- see the plan's phased
 * verification steps.
 *
 *   npx tsx --env-file=.env.local scripts/resetBusinessesAndVendors.ts
 *   npx tsx --env-file=.env.local scripts/resetBusinessesAndVendors.ts --confirm
 */

import { connectDB } from "../src/core/db/mongodb";
import Business from "../src/models/Business";
import VendorProfile from "../src/models/VendorProfile";
import BusinessMember from "../src/models/BusinessMember";
import Role from "../src/models/Role";
import UserRole from "../src/models/UserRole";

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  await connectDB();

  const businessCount = await Business.countDocuments({});
  const vendorCount = await VendorProfile.countDocuments({});
  const memberCount = await BusinessMember.countDocuments({});
  // Vendor-scoped roles only (vendorId not null) -- platform-wide roles
  // (SUPER_ADMIN, AN_ADMIN, CUSTOMER_*, the base ADMIN/MANAGER/EMPLOYEE/
  // VENDOR/CUSTOMER buckets) must survive this reset.
  const vendorRoleDocs = await Role.find({ vendorId: { $ne: null } }).select("_id").lean();
  const vendorRoleIds = vendorRoleDocs.map((r) => r._id);
  const vendorRoleCount = vendorRoleDocs.length;
  const userRoleCount = vendorRoleIds.length
    ? await UserRole.countDocuments({ roleId: { $in: vendorRoleIds } })
    : 0;

  console.log("Would delete:");
  console.log(`  Business:           ${businessCount}`);
  console.log(`  VendorProfile:      ${vendorCount}`);
  console.log(`  BusinessMember:     ${memberCount}`);
  console.log(`  Vendor-scoped Role: ${vendorRoleCount}`);
  console.log(`  UserRole (vendor):  ${userRoleCount}`);

  if (!CONFIRM) {
    console.log("\nDry run only -- re-run with --confirm to actually delete.");
    process.exit(0);
  }

  if (vendorRoleIds.length) {
    await UserRole.deleteMany({ roleId: { $in: vendorRoleIds } });
  }
  await Role.deleteMany({ vendorId: { $ne: null } });
  await BusinessMember.deleteMany({});
  await VendorProfile.deleteMany({});
  await Business.deleteMany({});

  console.log("\nDone. All Business/Vendor data removed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
