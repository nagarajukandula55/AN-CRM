/**
 * Finds any existing User with zero UserRole rows and assigns a sensible
 * default based on their legacy `role` enum, so the "every user has a
 * non-blank role" invariant holds retroactively -- not just for accounts
 * created after this migration shipped.
 *
 * Dry-run by default (prints what it WOULD do, writes nothing). Pass
 * --confirm to actually write.
 *
 *   npx tsx --env-file=.env.local scripts/backfillMissingUserRoles.ts
 *   npx tsx --env-file=.env.local scripts/backfillMissingUserRoles.ts --confirm
 */

import { connectDB } from "../src/core/db/mongodb";
import User from "../src/models/User";
import Role from "../src/models/Role";
import UserRole from "../src/models/UserRole";
import VendorProfile from "../src/models/VendorProfile";

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  await connectDB();

  const usersWithRoles = await UserRole.distinct("userId");
  const orphans = await User.find({
    _id: { $nin: usersWithRoles },
    isDeleted: { $ne: true },
  }).lean<any[]>();

  console.log(`${orphans.length} user(s) with zero UserRole rows.`);
  if (orphans.length === 0) {
    process.exit(0);
  }

  const plan: { userId: string; email: string; roleCode: string; businessId: string | null; vendorId: string | null }[] = [];

  for (const user of orphans) {
    const legacyRole = String(user.role || "CUSTOMER").toUpperCase();

    if (legacyRole === "VENDOR") {
      const vendor = await VendorProfile.findOne({ userId: user._id, isDeleted: { $ne: true } }).lean<any>();
      if (vendor && vendor.businessId) {
        plan.push({
          userId: user._id.toString(),
          email: user.email,
          roleCode: "VENDOR_OWNER",
          businessId: vendor.businessId.toString(),
          vendorId: vendor._id.toString(),
        });
        continue;
      }
      // No vendor profile found -- fall back to the shared floor VENDOR role.
      plan.push({ userId: user._id.toString(), email: user.email, roleCode: "VENDOR", businessId: null, vendorId: null });
      continue;
    }

    const roleCode =
      legacyRole === "SUPER_ADMIN" ? "SUPER_ADMIN" :
      legacyRole === "ADMIN" ? "ADMIN" :
      legacyRole === "STAFF" ? "EMPLOYEE" :
      user.registrationSource === "shopnative" ? "CUSTOMER_SHOPNATIVE" :
      "CUSTOMER_ANGROUP"; // safest floor for anything else, including plain CUSTOMER

    plan.push({ userId: user._id.toString(), email: user.email, roleCode, businessId: null, vendorId: null });
  }

  for (const p of plan) {
    console.log(`  ${p.email} -> ${p.roleCode}${p.vendorId ? ` (vendor ${p.vendorId})` : ""}`);
  }

  if (!CONFIRM) {
    console.log("\nDry run only -- re-run with --confirm to write these UserRole rows.");
    process.exit(0);
  }

  let written = 0;
  let skipped = 0;
  for (const p of plan) {
    const roleDoc = await Role.findOne({
      code: p.roleCode,
      businessId: p.businessId,
      vendorId: p.vendorId,
    });
    if (!roleDoc) {
      console.warn(`  SKIP ${p.email}: role "${p.roleCode}" not found for scope`);
      skipped++;
      continue;
    }
    await UserRole.updateOne(
      { userId: p.userId, roleId: roleDoc._id },
      { $setOnInsert: { userId: p.userId, roleId: roleDoc._id, businessId: p.businessId } },
      { upsert: true }
    );
    written++;
  }

  console.log(`\nDone. ${written} UserRole row(s) written, ${skipped} skipped (role not configured).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
