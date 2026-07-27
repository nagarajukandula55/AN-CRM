import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import User from "@/models/User";
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";

// One-time platform reset, requested directly by the account owner: strip
// every user's roles except SUPER_ADMIN grants, then deactivate anyone left
// holding zero roles. Locked to this specific account (not a general
// Super-Admin-gated route) since granting SUPER_ADMIN to yourself and then
// wiping every other account's access in one call is a bootstrap/recovery
// action, not something any existing Super Admin should be able to
// self-trigger blind. Safe to leave deployed: it only ever escalates THIS
// one email, and every other user's outcome (role-stripped, possibly
// deactivated) is reversible from Admin > Users / Admin > Access afterwards.
const OWNER_EMAIL = "anenterprises9396@gmail.com";

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

    // 1. Ensure the platform SUPER_ADMIN role exists, and grant it to the
    // caller before anything else -- "add super admin role to my id" runs
    // first so the caller is never the one left locked out by step 3.
    let superAdminRole = await Role.findOne({ code: "SUPER_ADMIN", businessId: null, vendorId: null });
    if (!superAdminRole) {
      superAdminRole = await Role.create({
        code: "SUPER_ADMIN",
        name: "Super Admin",
        description: "Full platform access.",
        permissions: [],
        businessId: null,
        vendorId: null,
        isSystem: true,
      });
    }
    await UserRole.updateOne(
      { userId: session.user.id, roleId: superAdminRole._id },
      { $setOnInsert: { userId: session.user.id, roleId: superAdminRole._id } },
      { upsert: true }
    );
    await User.updateOne({ _id: session.user.id }, { $set: { role: "SUPER_ADMIN", isActive: true } });

    // 2. Strip every UserRole grant that isn't the SUPER_ADMIN role --
    // "remove all current user roles apart from super admin ... and keep
    // that assigned". Every SUPER_ADMIN grant (the caller's new one, and
    // any that already existed) is left untouched.
    const stripResult = await UserRole.deleteMany({ roleId: { $ne: superAdminRole._id } });

    // 3. Any user now holding zero roles at all gets deactivated -- "if
    // any ID is with no role then it should be deactivated". Users who
    // still hold the SUPER_ADMIN role (or somehow another SUPER_ADMIN-role
    // grant) are untouched and stay active.
    const usersWithRoles = await UserRole.distinct("userId");
    const deactivateResult = await User.updateMany(
      { _id: { $nin: usersWithRoles }, isDeleted: { $ne: true } },
      { $set: { isActive: false } }
    );

    return NextResponse.json({
      success: true,
      grantedSuperAdminTo: session.user.email,
      rolesStripped: stripResult.deletedCount,
      usersDeactivated: deactivateResult.modifiedCount,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
