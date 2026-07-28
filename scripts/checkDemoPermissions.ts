/**
 * DIAGNOSTIC, READ-ONLY: prints exactly what's stored for a demo login --
 * its User/BusinessMember/UserRole/Role chain and whether CATALOG.CREATE
 * (or any code you pass) is actually in the resolved permission set. Run
 * this instead of guessing again after "still 403" reports -- it answers
 * the two live suspects directly: (1) did the demo script's last run
 * actually persist the fix, and (2) is the login's active business even
 * the one the Role is scoped to.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/checkDemoPermissions.ts demo.brand@an-crm.test CATALOG.CREATE
 */

import { connectDB } from "../src/core/db/mongodb";
import User from "../src/models/User";
import BusinessMember from "../src/models/BusinessMember";
import Business from "../src/models/Business";
import UserRole from "../src/models/UserRole";
import Role from "../src/models/Role";

async function main() {
  const email = process.argv[2];
  const codeToCheck = process.argv[3];
  if (!email) {
    throw new Error("Usage: npx tsx --env-file=.env.local scripts/checkDemoPermissions.ts <email> [PERMISSION.CODE]");
  }
  await connectDB();

  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.log(`No user found with email ${email}`);
    return;
  }
  console.log(`User: ${user.name} (${user._id}), role=${(user as any).role}, isActive=${(user as any).isActive}`);

  const memberships = await BusinessMember.find({ userId: user._id }).lean();
  console.log(`\nBusinessMember rows: ${memberships.length}`);
  for (const m of memberships as any[]) {
    const biz = await Business.findById(m.businessId).select("name operatingMode").lean();
    console.log(`  business=${(biz as any)?.name} (${m.businessId}) operatingMode=${(biz as any)?.operatingMode} status=${m.status} isDefaultBusiness=${m.isDefaultBusiness} memberType=${m.memberType}`);
  }

  const userRoles = await UserRole.find({ userId: user._id }).lean();
  console.log(`\nUserRole rows: ${userRoles.length}`);
  let allPermissions: string[] = [];
  for (const ur of userRoles as any[]) {
    const role = await Role.findById(ur.roleId).lean();
    if (!role) {
      console.log(`  roleId=${ur.roleId} -- ROLE DOES NOT EXIST (dangling UserRole row)`);
      continue;
    }
    const perms = (role as any).permissions || [];
    allPermissions = allPermissions.concat(perms);
    console.log(`  role=${(role as any).name} code=${(role as any).code} businessId=${(role as any).businessId} permissionCount=${perms.length}`);
  }

  if (codeToCheck) {
    const has = allPermissions.some((p) => p.toUpperCase() === codeToCheck.toUpperCase());
    console.log(`\nHas "${codeToCheck}" across all roles (before active-business filtering): ${has ? "YES" : "NO"}`);
    if (!has) {
      const close = allPermissions.filter((p) => p.toUpperCase().startsWith(codeToCheck.split(".")[0].toUpperCase()));
      console.log(`Permissions starting with "${codeToCheck.split(".")[0].toUpperCase()}.": ${close.length ? close.join(", ") : "(none at all)"}`);
    }
  }

  console.log(`\nNOTE: session-enriched.ts only counts a role's permissions when the role's`);
  console.log(`businessId matches whichever business is ACTIVE in the session at login time.`);
  console.log(`If BusinessMember.isDefaultBusiness is true above and this is the only`);
  console.log(`membership, that business should be the one auto-selected on login --`);
  console.log(`if the browser still shows a different active business (e.g. left over from`);
  console.log(`testing another demo login in the same session), switch businesses explicitly`);
  console.log(`or log out and back in fresh.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
