import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import User from "@/models/User";
import Role, { RoleStatus, RoleType } from "@/models/Role";
import UserRole from "@/models/UserRole";
import VendorProfile from "@/models/VendorProfile";
import { buildPermissionCode } from "@/core/access/actions";
import { ALL_MODULE_KEYS } from "@/core/access/moduleHierarchy";
import { ensureVendorCoreRoles } from "@/core/access/vendorAccess.service";
import { getOrCreateANGroupBusinessId } from "@/core/access/anGroupBusiness.service";

/**
 * POST /api/admin/maintenance/rebuild-access — the one-shot cutover to the
 * final access architecture ("withdraw entire access role systems and
 * build in this way"):
 *
 *   AN Group (platform)
 *     ├─ SUPER_ADMIN        full access to everything, everywhere
 *     ├─ AN_STAFF           sees ALL data across every business (view/export)
 *     └─ Businesses
 *          └─ per-business custom roles — NONE are seeded; the Super
 *             Admin creates every one themselves from Admin > Access
 *             (business first, then that business's available modules),
 *             per explicit direction: "don't keep any default roles,
 *             i'll add everything by myself... because it varies"
 *               └─ Vendors: OWNER + MANAGER (structural, not pickable
 *                  role-menu entries), staff get per-module access grants
 *                  from the vendor profile page's Team & Access section
 *
 * What it does, in order:
 *  1. Ensures the AN Group business record exists.
 *  2. Ensures SUPER_ADMIN exists and grants it to the caller (plus
 *     User.role = SUPER_ADMIN so the login-time flag is right).
 *  3. Seeds AN_STAFF (view+export on every module, platform-wide) — the
 *     only non-Super-Admin role that exists out of the box, because "AN
 *     Group staff see everything" is part of the architecture itself.
 *  4. DELETES every other role in the system — every manually-created
 *     role, every old 11-role vendor set, every stale personal grant —
 *     along with their UserRole links. The three CUSTOMER floor codes are
 *     kept (structural plumbing for registration/login, zero permissions).
 *  5. Regenerates the structural Owner/Manager pair for every ACTIVE
 *     vendor so vendor logins keep working immediately.
 *  6. Deactivates any account left holding zero roles (standing
 *     direction: no ID may sit around with no role).
 *
 * Locked to the account owner's email — this is a bootstrap/recovery
 * action, and it must never be blocked by the caller not yet having the
 * SUPER_ADMIN flag it is itself responsible for granting.
 */
const OWNER_EMAIL = "anenterprises9396@gmail.com";

// Structural role codes that survive the wipe — nothing else does. No
// default/department role sets are seeded: every working role is created
// by the Super Admin per business from Admin > Access.
const KEEP_CODES = [
  "SUPER_ADMIN",
  "AN_STAFF",
  "CUSTOMER",
  "CUSTOMER_ANGROUP",
  "CUSTOMER_SHOPNATIVE",
];

export async function POST() {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.email?.toLowerCase() !== OWNER_EMAIL) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    await connectDB();

    // 1. AN Group business record.
    const anGroupBusinessId = await getOrCreateANGroupBusinessId();

    // 2. SUPER_ADMIN — ensure, grant to caller, set the login-time flag.
    let superAdminRole = await Role.findOne({ code: "SUPER_ADMIN", businessId: null, vendorId: null });
    if (!superAdminRole) {
      superAdminRole = await Role.create({
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
    }
    await UserRole.updateOne(
      { userId: session.user.id, roleId: superAdminRole._id },
      { $setOnInsert: { userId: session.user.id, roleId: superAdminRole._id } },
      { upsert: true }
    );
    await User.updateOne({ _id: session.user.id }, { $set: { role: "SUPER_ADMIN", isActive: true } });

    // 3. AN_STAFF — sees EVERYTHING across every business, no limits
    // (view + export on every module in the hierarchy). What they can
    // change is up to additional roles (the department admin set below,
    // or per-business roles).
    const anStaffPermissions = ALL_MODULE_KEYS.flatMap((m) => [
      buildPermissionCode(m, "view"),
      buildPermissionCode(m, "export"),
    ]);
    await Role.updateOne(
      { code: "AN_STAFF", businessId: null, vendorId: null },
      {
        $setOnInsert: {
          code: "AN_STAFF",
          businessId: null,
          vendorId: null,
          name: "AN Group Staff",
          description: "AN Group's own staff — sees all data across every business (view/export everywhere).",
          type: RoleType.SYSTEM,
          status: RoleStatus.ACTIVE,
          isSystem: true,
          isProtected: true,
        },
        $set: { permissions: anStaffPermissions },
      },
      { upsert: true }
    );

    // 4. THE WIPE — delete every role not in the keep list, plus every
    // UserRole link pointing at a deleted role.
    const keptRoles = await Role.find({ code: { $in: KEEP_CODES } }).select("_id").lean();
    const keptIds = keptRoles.map((r: any) => r._id);
    const wipeResult = await Role.deleteMany({ _id: { $nin: keptIds } });
    const orphanResult = await UserRole.deleteMany({ roleId: { $nin: keptIds } });

    // 5. Regenerate Owner/Manager for every active vendor so vendor
    // logins keep their access without waiting for a lazy self-heal.
    const activeVendors = await VendorProfile.find({
      status: "ACTIVE",
      isDeleted: { $ne: true },
      businessId: { $ne: null },
    })
      .select("_id businessId")
      .lean();
    for (const v of activeVendors as any[]) {
      await ensureVendorCoreRoles(String(v._id), String(v.businessId)).catch(() => {});
    }

    // 6. Zero-role accounts get deactivated (caller excluded by the
    // SUPER_ADMIN grant above).
    const usersWithRoles = await UserRole.distinct("userId");
    const deactivateResult = await User.updateMany(
      { _id: { $nin: usersWithRoles }, isDeleted: { $ne: true } },
      { $set: { isActive: false } }
    );

    return NextResponse.json({
      success: true,
      anGroupBusinessId,
      grantedSuperAdminTo: session.user.email,
      rolesDeleted: wipeResult.deletedCount,
      grantsRemoved: orphanResult.deletedCount,
      vendorsRegenerated: activeVendors.length,
      usersDeactivated: deactivateResult.modifiedCount,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
