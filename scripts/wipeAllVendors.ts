/**
 * Erases every registered vendor for a clean go-live: VendorProfile,
 * their BusinessMember rows, vendor-scoped Role/UserRole documents, and
 * the underlying User login accounts (role: VENDOR) -- but NOT any
 * Business record. Deliberately narrower than scripts/
 * resetBusinessesAndVendors.ts, which also wipes every Business
 * (including the platform's own self-representing one, "AN-CRM
 * Platform" -- tonight's central-api sync, GST state, and skip-approval
 * config all live on that record, so THAT script would silently undo all
 * of that too).
 *
 * Dry-run by default (counts only, writes nothing). Pass --confirm to
 * actually delete.
 *
 *   npx tsx --env-file=.env.local scripts/wipeAllVendors.ts
 *   npx tsx --env-file=.env.local scripts/wipeAllVendors.ts --confirm
 */
import { connectDB } from "../src/lib/mongodb";
import VendorProfile from "../src/models/VendorProfile";
import BusinessMember from "../src/models/BusinessMember";
import Role from "../src/models/Role";
import UserRole from "../src/models/UserRole";
import User from "../src/models/User";

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  await connectDB();

  const vendors = await VendorProfile.find({}).select("_id userId vendorId companyName").lean();
  const vendorIds = vendors.map((v) => v._id);
  const userIds = vendors.map((v) => v.userId).filter(Boolean);

  const memberCount = await BusinessMember.countDocuments({ vendorId: { $in: vendorIds } });
  const vendorRoleDocs = await Role.find({ vendorId: { $in: vendorIds } }).select("_id").lean();
  const vendorRoleIds = vendorRoleDocs.map((r) => r._id);
  const userRoleCount = vendorRoleIds.length
    ? await UserRole.countDocuments({ roleId: { $in: vendorRoleIds } })
    : 0;
  const userCount = userIds.length ? await User.countDocuments({ _id: { $in: userIds } }) : 0;

  console.log("Would delete:");
  console.log(`  VendorProfile:            ${vendors.length}`);
  vendors.forEach((v) => console.log(`    - ${v.vendorId || "(no id)"} — ${v.companyName}`));
  console.log(`  BusinessMember (vendor):  ${memberCount}`);
  console.log(`  Vendor-scoped Role:       ${vendorRoleDocs.length}`);
  console.log(`  UserRole (vendor):        ${userRoleCount}`);
  console.log(`  User login accounts:      ${userCount}`);
  console.log(`\nNOT touched: any Business record (including "AN-CRM Platform").`);

  if (!CONFIRM) {
    console.log("\nDry run only -- re-run with --confirm to actually delete.");
    process.exit(0);
  }

  await BusinessMember.deleteMany({ vendorId: { $in: vendorIds } });
  if (vendorRoleIds.length) await UserRole.deleteMany({ roleId: { $in: vendorRoleIds } });
  await Role.deleteMany({ vendorId: { $in: vendorIds } });
  if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
  await VendorProfile.deleteMany({});

  console.log("\nDone. Every vendor, their login, and their vendor-scoped roles were deleted. Businesses were left untouched.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
