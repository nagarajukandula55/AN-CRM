import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import User from "@/models/User";
import Role, { RoleStatus, RoleType } from "@/models/Role";
import UserRole from "@/models/UserRole";

// One-time, browser-triggerable equivalent of scripts/wipeToSuperAdminOnly.ts
// -- for when running the script locally against production isn't practical
// (no local .env.local with real DB credentials). Locked to this specific
// account for the same reason as reset-roles/route.ts: this deletes every
// Role document except SUPER_ADMIN, not just assignments, so it must not be
// a general Super-Admin-gated action.
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
    }

    const wipeResult = await Role.deleteMany({ _id: { $ne: superAdmin._id } });
    const orphanResult = await UserRole.deleteMany({ roleId: { $ne: superAdmin._id } });

    const usersWithRoles = await UserRole.distinct("userId");
    const deactivateResult = await User.updateMany(
      { _id: { $nin: usersWithRoles }, isDeleted: { $ne: true } },
      { $set: { isActive: false } }
    );

    return NextResponse.json({
      success: true,
      rolesDeleted: wipeResult.deletedCount,
      userRoleGrantsDeleted: orphanResult.deletedCount,
      usersDeactivated: deactivateResult.modifiedCount,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
