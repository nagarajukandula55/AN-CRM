/**
 * DEMO BOOTSTRAP: one Business + one login per operating mode (Brand, SC,
 * POS), so the actual product differences per mode (nav, modules, pricing
 * assumptions) can be checked end-to-end without touching any real vendor
 * or business data. INSERT/UPSERT-ONLY, safe to re-run -- upserts by email,
 * never touches any other account or business.
 *
 * Each login is a full admin (not super admin, not a vendor-portal login)
 * scoped ONLY to its own demo business, with every current module's full
 * permission set -- enough to see and use every admin nav item that
 * business's operatingMode unlocks.
 *
 * HOW TO RUN:
 *   DEMO_LOGIN_PASSWORD='...' npx tsx --env-file=.env.local scripts/createDemoOperatingModeLogins.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Business from "../src/models/Business";
import User from "../src/models/User";
import BusinessMember from "../src/models/BusinessMember";
import Role from "../src/models/Role";
import UserRole from "../src/models/UserRole";
import ModuleDefinition from "../src/core/module-registry/ModuleDefinition.model";
import { buildPermissionCode, STANDARD_ACTIONS } from "../src/core/access/actions";
import { STATIC_MODULES } from "../src/components/sidebar-nav";
import bcrypt from "bcryptjs";

const PASSWORD = process.env.DEMO_LOGIN_PASSWORD;

const DEMOS: { mode: "BRAND" | "SC" | "POS"; name: string; code: string; email: string }[] = [
  { mode: "BRAND", name: "Demo Brand Co.", code: "DEMO-BRAND", email: "demo.brand@an-crm.test" },
  { mode: "SC", name: "Demo Service Center", code: "DEMO-SC", email: "demo.sc@an-crm.test" },
  { mode: "POS", name: "Demo Retail Store", code: "DEMO-POS", email: "demo.pos@an-crm.test" },
];

const ALL_ACTION_KEYS = STANDARD_ACTIONS.map((a) => a.key);

// Snapshot (via `grep -rn 'buildPermissionCode("' src/app/api`) of every
// permission-code module key any API route actually checks -- several
// (catalog, brands, device_models, fault_codes, solutions, staff, hr_*,
// audit, assets, contact_messages) have no 1:1 sidebar key at all, so
// STATIC_MODULES/ModuleDefinition alone missed them: a demo login could
// see the "Brands & Models" nav item but still get a 403 CATALOG.CREATE
// the moment it tried to submit anything, since the checked code and the
// nav key are different strings. Extend this list if a new route
// introduces another key.
const EXTRA_PERMISSION_KEYS = [
  "catalog", "brands", "device_models", "fault_codes", "solutions",
  "staff", "hr_documents", "hr_leaves", "hr_payroll", "audit", "assets",
  "contact_messages", "sales_documents",
];

async function main() {
  if (!PASSWORD) {
    throw new Error("Set DEMO_LOGIN_PASSWORD in the environment before running this script.");
  }
  await connectDB();

  const hashedPassword = await bcrypt.hash(PASSWORD, 12);
  // Every DB-seeded module key PLUS every static sidebar key (STATIC_MODULES
  // -- see sidebar-nav.ts) -- most sidebar items (Settings, Customer Data,
  // Vendors, BOM, Inventory, Finance, ...) never got a ModuleDefinition row
  // seeded at all, only the DB-seeded ones (mirroring seedDefaultRoles.ts's
  // AN_ADMIN role) would have left these demo logins seeing almost nothing
  // but the dashboard.
  const dbModuleKeys: string[] = await ModuleDefinition.find({ businessId: null }).distinct("key");
  const staticKeys = STATIC_MODULES.map((m) => m.key);
  const allModuleKeys = Array.from(new Set([...dbModuleKeys, ...staticKeys, ...EXTRA_PERMISSION_KEYS]));
  const permissionCodes = allModuleKeys.flatMap((m) => ALL_ACTION_KEYS.map((a) => buildPermissionCode(m, a)));

  for (const demo of DEMOS) {
    let business = await Business.findOne({ businessCode: demo.code });
    if (!business) {
      business = await Business.create({
        name: demo.name,
        brandName: demo.name,
        businessCode: demo.code,
        tenantKey: demo.code.toLowerCase(),
        operatingMode: demo.mode,
        isActive: true,
      });
      console.log(`Created Business "${demo.name}" (${demo.mode}), id ${business._id}`);
    } else {
      console.log(`Business "${demo.name}" already exists, id ${business._id} -- not recreating.`);
    }

    let user = await User.findOne({ email: demo.email }).select("+password");
    if (user) {
      user.set({ name: demo.name + " Admin", password: hashedPassword, role: "ADMIN", isActive: true, isEmailVerified: true });
      await user.save();
      console.log(`  Updated login ${demo.email} (id ${user._id})`);
    } else {
      user = await User.create({
        name: demo.name + " Admin",
        email: demo.email,
        password: hashedPassword,
        role: "ADMIN",
        isActive: true,
        isEmailVerified: true,
        authProvider: "credentials",
      } as any);
      console.log(`  Created login ${demo.email} (id ${user._id})`);
    }

    await BusinessMember.updateOne(
      { userId: user._id, businessId: business._id },
      {
        $setOnInsert: {
          userId: user._id,
          businessId: business._id,
          memberType: "OWNER",
          isDefaultBusiness: true,
          joinedAt: new Date(),
        },
        $set: { status: "ACTIVE" },
      },
      { upsert: true }
    );

    // Business-scoped role, full CRUD across every current module -- lets
    // this login see every nav item its operatingMode unlocks, without
    // being platform-wide super admin (so cross-business isolation still
    // shows up correctly, e.g. it never sees other businesses' vendors).
    const roleCode = `DEMO_${demo.mode}_ADMIN`;
    await Role.updateOne(
      { code: roleCode, businessId: business._id },
      {
        $setOnInsert: {
          code: roleCode,
          name: `${demo.name} Admin`,
          description: `Full access within the ${demo.mode} demo business only.`,
          businessId: business._id,
          isSystem: false,
          isProtected: false,
        },
        $set: { permissions: permissionCodes },
      },
      { upsert: true }
    );
    const roleDoc = await Role.findOne({ code: roleCode, businessId: business._id });
    await UserRole.updateOne(
      { userId: user._id, roleId: roleDoc!._id },
      { $setOnInsert: { userId: user._id, roleId: roleDoc!._id } },
      { upsert: true }
    );

    console.log(`  Login ready: ${demo.email} / (the password you set) -- business: ${demo.name} (${demo.mode})`);
  }

  console.log("\nDone. Log in at /login with each email above and the DEMO_LOGIN_PASSWORD you set.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
