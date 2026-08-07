/**
 * ONE-TIME (re-runnable): fixes User.role for any vendor Owner whose
 * account still shows "CUSTOMER" instead of "VENDOR" -- the bug this
 * repairs (see services/vendorActivation.service.ts's provisionVendorLogin,
 * "existing user" branch) meant a vendor Owner who signed up through the
 * normal public flow (which always creates their account via
 * /api/auth/register FIRST, with role: CUSTOMER, before vendor activation
 * ever runs) had their role never updated to VENDOR -- so
 * vendor/layout.tsx's access gate ("role === VENDOR" OR a staff
 * BusinessMember row) bounced them straight back to /login on every
 * login, forever, even though their vendor account was genuinely active.
 * The code fix stops this happening to anyone NEW; this script repairs
 * anyone it ALREADY happened to.
 *
 * Finds every ACTIVE VendorProfile, checks its linked User's role, fixes
 * it if it's not already VENDOR. Safe to re-run.
 *
 *   npx tsx --env-file=.env.local scripts/fixVendorOwnerRoles.ts
 */
import { connectDB } from "../src/lib/mongodb";
import VendorProfile from "../src/models/VendorProfile";
import User, { UserRoleLegacy } from "../src/models/User";

async function main() {
  await connectDB();

  const vendors = await VendorProfile.find({ status: "ACTIVE", userId: { $ne: null } })
    .select("userId vendorId companyName")
    .lean();
  console.log(`Found ${vendors.length} active vendor(s) to check.`);

  let fixed = 0;
  for (const v of vendors as any[]) {
    const user = await User.findById(v.userId).select("role username email");
    if (!user) {
      console.log(`  ${v.vendorId || v.companyName} -- no User record found (userId ${v.userId}), skipping.`);
      continue;
    }
    if (user.role !== UserRoleLegacy.VENDOR) {
      console.log(`  ${v.vendorId || v.companyName} -- was "${user.role}", fixing to VENDOR (login: ${user.username || user.email})`);
      user.role = UserRoleLegacy.VENDOR;
      await user.save();
      fixed++;
    }
  }

  console.log(`\nDone. Fixed ${fixed} account(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
