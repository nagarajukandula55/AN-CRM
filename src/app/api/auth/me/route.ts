import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Business from "@/models/Business";
import BusinessMember from "@/models/BusinessMember";
import UserRole from "@/models/UserRole";
import Role from "@/models/Role";
import { getOrCreateANGroupBusinessId } from "@/core/access/anGroupBusiness.service";

export async function GET(req: Request) {
  try {
    const userId      = req.headers.get("x-user-id");
    const isSuperAdmin = req.headers.get("x-is-super-admin") === "true";
    const activeBusinessId = req.headers.get("x-active-business-id");
    const tokenSessionVersionHeader = req.headers.get("x-session-version");

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    await connectDB();

    const user = await User.findById(userId)
      .select("-password")
      .lean()
      .exec() as any;

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    // Single active session -- this is the endpoint the frontend polls to
    // confirm "am I still logged in", so a stale token from a previous
    // login elsewhere gets caught here promptly, not just on routes that
    // happen to call getEnrichedSession. See api/auth/login and
    // lib/auth/session-enriched.ts for where sessionVersion is bumped/set.
    if (
      tokenSessionVersionHeader !== null &&
      Number(tokenSessionVersionHeader) !== (user.sessionVersion || 0)
    ) {
      return NextResponse.json(
        { success: false, message: "Logged in elsewhere. Please log in again.", sessionExpired: true },
        { status: 401 }
      );
    }

    const userRoleDocs = await UserRole.find({ userId: user._id }).select("roleId").lean().exec() as any[];

    // A platform-wide ("AN Group") role -- one granted with no businessId/
    // vendorId, e.g. AN_ADMIN or a custom AN staff role created from Admin
    // > Access -- means this account works across every business, not one
    // tenant. Previously only isSuperAdmin got that: an AN Group staff
    // member with real platform-wide access still only saw the handful of
    // businesses they happened to have an explicit BusinessMember row for,
    // and had no "AN Group" / cross-business option in the switcher at all.
    const platformRoleCount = userRoleDocs.length
      ? await Role.countDocuments({ _id: { $in: userRoleDocs.map((r) => r.roleId) }, businessId: null, vendorId: null })
      : 0;
    const isPlatformStaff = isSuperAdmin || platformRoleCount > 0;

    let businesses: any[] = [];

    if (isPlatformStaff) {
      // Super admin or AN Group platform staff: see every active business
      // (per-page/module permission checks still gate what data within
      // each business they can actually view/edit). Ensures AN Group's own
      // real Business record exists so it's always present in this list,
      // not just after some other feature happens to create it first.
      await getOrCreateANGroupBusinessId();
      businesses = await (Business as any).find({ isActive: true })
        .select("_id name brandName businessCode type isPlatform")
        .lean();
    } else {
      // Regular users: load via BusinessMember
      const memberships = await BusinessMember.find({
        userId: user._id,
        status: "ACTIVE",
      })
        .select("businessId isDefaultBusiness memberType")
        .lean() as any[];

      const businessIds = memberships.map((m) => m.businessId);
      if (businessIds.length > 0) {
        const bizDocs = await (Business as any).find({
          _id: { $in: businessIds },
          isActive: true,
        })
          .select("_id name brandName businessCode type")
          .lean() as any[];

        // Merge membership metadata into each business
        businesses = bizDocs.map((biz: any) => {
          const mem = memberships.find(
            (m) => m.businessId.toString() === biz._id.toString()
          );
          return {
            ...biz,
            memberType: mem?.memberType,
            isDefault:  mem?.isDefaultBusiness ?? false,
          };
        });
      }
    }

    // First granted role that has a custom moduleOrder configured (see
    // admin/access page's "Sidebar Order" editor) -- lets the sidebar
    // re-order nav items per role without a separate round trip per page.
    // Was skipped entirely for isSuperAdmin accounts, on the assumption a
    // super admin has no meaningful "role" -- but a super admin account
    // can still hold a real granted UserRole (e.g. testing a custom role,
    // or a super admin who is ALSO a business Manager), and that's exactly
    // who was testing this feature and seeing it silently do nothing.
    let moduleOrder: string[] = [];
    if (userRoleDocs.length) {
      const roleWithOrder = await Role.findOne({
        _id: { $in: userRoleDocs.map((r) => r.roleId) },
        moduleOrder: { $exists: true, $not: { $size: 0 } },
      }).select("moduleOrder").lean().exec() as any;
      moduleOrder = roleWithOrder?.moduleOrder || [];
    }

    return NextResponse.json({
      success: true,
      user: {
        id:                    user._id.toString(),
        email:                 user.email,
        username:              user.username || null,
        name:                  user.name,
        phone:                 user.phone || null,
        avatar:                user.avatar || null,
        role:                  user.role,
        accountType:           user.accountType || "RETAIL",
        businessName:          user.businessName || null,
        gstNumber:             user.gstNumber || null,
        isSuperAdmin,
        isPlatformStaff,
        activeBusinessId:      activeBusinessId || null,
        defaultBusinessId:     user.defaultBusinessId?.toString() || null,
        defaultOrganizationId: user.defaultOrganizationId?.toString() || null,
        lastLogin:             user.lastLogin || null,
        createdAt:             user.createdAt,
        moduleOrder,
      },
      businesses,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
