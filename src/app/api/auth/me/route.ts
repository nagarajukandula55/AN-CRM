import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Business from "@/models/Business";
import BusinessMember from "@/models/BusinessMember";
import UserRole from "@/models/UserRole";
import Role from "@/models/Role";
import { getOrCreateANGroupBusinessId } from "@/core/access/anGroupBusiness.service";
import { resolveOwnerOrManagerVendor } from "@/core/access/vendorAccess.service";

export async function GET(req: Request) {
  try {
    const userId      = req.headers.get("x-user-id");
    const isSuperAdmin = req.headers.get("x-is-super-admin") === "true";
    let activeBusinessId = req.headers.get("x-active-business-id");

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

    // Single active session enforcement -- DISABLED here too, same as
    // lib/auth/session-enriched.ts, per explicit direction to allow
    // multiple concurrent sessions for now. This was a SEPARATE check
    // from that file's (this endpoint is what the frontend polls to
    // confirm "am I still logged in", independent of getEnrichedSession),
    // so disabling one without the other left this one still silently
    // logging out a second device.
    // if (
    //   tokenSessionVersionHeader !== null &&
    //   Number(tokenSessionVersionHeader) !== (user.sessionVersion || 0)
    // ) {
    //   return NextResponse.json(
    //     { success: false, message: "Logged in elsewhere. Please log in again.", sessionExpired: true },
    //     { status: 401 }
    //   );
    // }

    // A vendor Owner has no BusinessMember row (see buildAuthSession.ts's
    // matching comment) -- the x-active-business-id header comes from the
    // JWT, only recomputed at login, so an account whose token was issued
    // before that fix (or that just never had it set) would carry no
    // active business here either. Recompute live rather than requiring
    // a fresh login for this to self-heal. Computed once and reused below
    // (the businesses-list branch needs it too) rather than looked up twice.
    const ownerOrManagerVendor = await resolveOwnerOrManagerVendor(userId).catch(() => null);
    const ownVendorBusinessId = (ownerOrManagerVendor as any)?.businessId;
    if (!activeBusinessId && ownVendorBusinessId) {
      activeBusinessId = String(ownVendorBusinessId);
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
      // Super admin / AN Group platform staff used to see EVERY active
      // business here, which fed the sidebar's business-switcher dropdown
      // and let them "switch into" any vendor's business and operate its
      // console as if logged in as that vendor -- switch-business/route.ts
      // now rejects that (platform administration only, no acting-as-a-
      // vendor), so offering those businesses in the switcher would just
      // be a dead-end dropdown entry that 403s on click. Show only the AN
      // Group platform business (always present -- see
      // getOrCreateANGroupBusinessId below) plus any business they hold a
      // REAL ACTIVE BusinessMember row for, same as a regular user -- a
      // super admin who is ALSO a genuine staff member of some business
      // keeps that legitimate switch working.
      await getOrCreateANGroupBusinessId();
      const anGroupBiz = await (Business as any).find({ isActive: true, isPlatform: true })
        .select("_id name brandName businessCode type isPlatform operatingMode")
        .lean();

      const memberships = await BusinessMember.find({ userId: user._id, status: "ACTIVE" })
        .select("businessId")
        .lean() as any[];
      const memberBusinessIds = memberships.map((m) => m.businessId);
      const memberBiz = memberBusinessIds.length
        ? await (Business as any).find({ _id: { $in: memberBusinessIds }, isActive: true })
            .select("_id name brandName businessCode type isPlatform operatingMode")
            .lean()
        : [];

      const seen = new Set<string>();
      businesses = [...anGroupBiz, ...memberBiz].filter((b: any) => {
        const id = String(b._id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
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
          .select("_id name brandName businessCode type operatingMode")
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

      // A vendor Owner has NO BusinessMember row at all (see
      // buildAuthSession.ts's matching comment) -- the loop above only
      // ever finds STAFF memberships, so an Owner with no staff role of
      // their own got an empty/incomplete businesses list, meaning even a
      // correctly-resolved activeBusinessId couldn't be matched against
      // anything here (the business switcher showed nothing, or fell
      // back to whatever the caller defaulted to). Add the vendor's own
      // business if it isn't already present from a membership.
      if (ownVendorBusinessId && !businesses.some((b) => b._id.toString() === ownVendorBusinessId.toString())) {
        const ownBiz = await (Business as any).findById(ownVendorBusinessId)
          .select("_id name brandName businessCode type operatingMode")
          .lean();
        if (ownBiz) businesses.push({ ...ownBiz, isDefault: businesses.length === 0 });
      }

      // The self-heal above (line ~64) only fires when the header is
      // completely EMPTY -- a header carrying a real but WRONG value (a
      // stale JWT issued for a since-changed business, or the platform
      // business id leaking onto a non-staff account) skipped it entirely
      // and was reported live as the sidebar sticking on "AN-CRM
      // (Platform)" for an ordinary vendor even after that fix. Any
      // non-platform-staff account's activeBusinessId must resolve to one
      // of THEIR OWN businesses; if it doesn't, recompute it the same way
      // the empty-header case already does instead of trusting the header.
      if (
        activeBusinessId &&
        !businesses.some((b) => b._id.toString() === activeBusinessId)
      ) {
        activeBusinessId = ownVendorBusinessId
          ? String(ownVendorBusinessId)
          : businesses[0]?._id
            ? String(businesses[0]._id)
            : null;
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
