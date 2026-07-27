import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import BusinessMember from "@/models/BusinessMember";
import Business from "@/models/Business";
import UserRole from "@/models/UserRole";
import Role from "@/models/Role";
import { signToken } from "@/lib/auth/jwt";
import { resolveOwnerOrManagerVendor } from "@/core/access/vendorAccess.service";

// Anyone holding ONLY these floor roles has no admin-panel business at
// all -- they should never see the /admin shell, just their own storefront
// account (shopnative.in for now; angroup.in has no customer-facing UI of
// its own yet, so it also lands there).
const MINIMAL_FLOOR_ROLE_CODES = ["CUSTOMER_SHOPNATIVE", "CUSTOMER_ANGROUP"];

export async function POST(req: Request) {
  try {
    await connectDB();

    const body = await req.json();
    const { email, username, password } = body ?? {};

    if ((!email && !username) || !password) {
      return NextResponse.json(
        { success: false, message: "Credentials required" },
        { status: 400 }
      );
    }

    /* ── Find user by email OR username ──────────────────────────────── */
    // password has select:false — must explicitly request it
    const user = await User.findOne({
      $or: [
        ...(email    ? [{ email: email.toLowerCase().trim() }] : []),
        ...(username ? [{ username: username.toLowerCase().trim() }] : []),
      ],
    })
      .select("+password")
      .lean()
      .exec() as any;

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    if (!user.password) {
      return NextResponse.json(
        { success: false, message: "Invalid user record" },
        { status: 500 }
      );
    }

    // Was never checked here at all -- a deactivated account (isActive:
    // false, e.g. the zero-role accounts scripts/wipeToSuperAdminOnly.ts
    // and /api/admin/maintenance/wipe-roles deliberately deactivate) could
    // still authenticate successfully and get a valid session.
    if (user.isActive === false) {
      return NextResponse.json(
        { success: false, message: "This account has been deactivated. Contact your administrator." },
        { status: 403 }
      );
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { success: false, message: "Invalid password" },
        { status: 401 }
      );
    }

    // Several signup paths deliberately create the account with
    // isActive:false — a vendor pending admin approval
    // (register/vendor/route.ts), or an employee pending HR activation —
    // but this check never existed, so a valid password alone was enough
    // to log in and receive a full session token regardless of pending
    // status. Must be checked here, not just left to "isActive" filters on
    // individual downstream routes, since the token itself grants access.
    if (user.isActive === false) {
      return NextResponse.json(
        { success: false, message: "Your account is not active yet. Please wait for approval or contact support." },
        { status: 403 }
      );
    }

    /* ── Load business memberships from BusinessMember collection ────── */
    const memberships = await BusinessMember.find({
      userId: user._id,
      status: "ACTIVE",
    })
      .select("businessId isDefaultBusiness memberType vendorId")
      .sort({ createdAt: -1 })
      .lean()
      .exec() as any[];

    const businessIds: string[] = memberships.map((m) => m.businessId.toString());

    // Pick active business: prefer isDefaultBusiness, then legacy defaultBusinessId,
    // then the most recently joined membership (memberships sorted newest-first
    // above) -- was un-sorted "first", i.e. whatever Mongo's natural order
    // happened to return, which could silently land a vendor-team member on a
    // stale/leftover membership ahead of the one they actually just joined.
    let activeBusinessId: string | undefined;
    const defaultMembership = memberships.find((m) => m.isDefaultBusiness);
    if (defaultMembership) {
      activeBusinessId = defaultMembership.businessId.toString();
    } else if (user.defaultBusinessId) {
      activeBusinessId = user.defaultBusinessId.toString();
    } else if (businessIds.length > 0) {
      activeBusinessId = businessIds[0];
    }

    // Super admin gets all business access — no restriction
    const isSuperAdmin = user.role === "SUPER_ADMIN";

    // A user whose ONLY roles are the minimal self-registration floor (no
    // AN staff role, no vendor-team role, no business membership) gets
    // redirected to shopnative.in rather than the admin panel -- there's no
    // separate customer UI in this repo yet.
    const userRoleDocs = await UserRole.find({ userId: user._id }).lean().exec() as any[];
    const grantedRoles = userRoleDocs.length
      ? await Role.find({ _id: { $in: userRoleDocs.map((r) => r.roleId) } }).select("code homeRoute businessId vendorId permissions").lean().exec() as any[]
      : [];
    const roleCodes = grantedRoles.map((r) => r.code);
    // AN Group platform staff -- holds a real, non-floor role with no
    // businessId/vendorId (platform-wide, e.g. AN_ADMIN/ADMIN/EMPLOYEE or
    // a custom AN staff role) AND at least one actual permission -- NOT
    // just "no businessId", since the minimal self-registration floor
    // roles (CUSTOMER/CUSTOMER_ANGROUP/CUSTOMER_SHOPNATIVE) are also
    // global with no businessId; without excluding those, every ordinary
    // customer account would have been mistakenly granted cross-business
    // staff visibility. Treated like super admin for cross-business
    // VISIBILITY only (see middleware.ts's x-is-platform-staff header) --
    // still gated by their actual granted permissions per module/page.
    const isPlatformStaff =
      isSuperAdmin ||
      grantedRoles.some(
        (r) => !r.businessId && !r.vendorId && !MINIMAL_FLOOR_ROLE_CODES.includes(r.code) && (r.permissions?.length || 0) > 0
      );
    // Per-role configurable login landing page (admin/roles editor's new
    // "Home Page" field) -- a floor role (CUSTOMER etc.) never has one set,
    // so the first non-floor role that does wins. Falls back to the
    // existing role/account-type redirect the login page already does when
    // nothing is configured, so this is additive, not a behavior change for
    // roles nobody has configured a home page for yet.
    let homeRoute = grantedRoles.find((r) => r.homeRoute && !MINIMAL_FLOOR_ROLE_CODES.includes(r.code))?.homeRoute || null;

    // SC (Service Center) businesses are single-login, single-screen by
    // spec -- "SC is single login only... maintain entire workorder flow
    // in single view or page" -- so anyone logging into an SC-mode business
    // (other than a super admin, who needs full nav to administer every
    // business) always lands directly on the workorder screen, regardless
    // of what homeRoute their role happens to have configured. Looked up
    // fresh here rather than trusted from the client for the same reason
    // activeBusinessId itself isn't client-supplied.
    if (activeBusinessId && !isSuperAdmin) {
      const activeBusiness = await Business.findById(activeBusinessId).select("operatingMode").lean<any>();
      if (activeBusiness?.operatingMode === "SC") {
        homeRoute = "/admin/crm/jobsheets";
      }
    }

    // Anyone attached to a vendor's team -- Owner/Manager (see
    // resolveOwnerOrManagerVendor) OR any other vendor-team member
    // (CCO/Engineer/etc., tagged via an ACTIVE BusinessMember row with
    // vendorId set, same test vendor/layout.tsx's own access guard uses)
    // -- belongs on /vendor no matter what a business-wide role they ALSO
    // happen to hold sets as its own homeRoute -- e.g. manager@vendor.com
    // holds the business-wide "MANAGER" role (homeRoute "/admin/crm",
    // configured for a completely unrelated business-employee use case)
    // purely to get Manager-equivalent vendor access, and was landing on
    // /admin/crm instead of their own vendor portal every time they
    // logged in. Previously only Owner/Manager were covered here, so an
    // Engineer/CCO with a homeRoute-bearing business role still landed on
    // /admin despite /vendor/crm/calls + /vendor/crm/jobsheets existing
    // specifically for them (see vendor/layout.tsx's own comment).
    const hasVendorAccess =
      memberships.some((m) => !!m.vendorId) ||
      !!(await resolveOwnerOrManagerVendor(user._id.toString()).catch(() => null));
    // Engineer/CCO land on /vendor per hasVendorAccess above (correct --
    // see that comment), but /vendor's own root page is a generic
    // Owner/Manager sales dashboard, "nothing informative" for their role.
    // Surfaced separately so the login page can send them to /vendor/crm
    // instead, without touching hasVendorAccess itself or Owner/Manager's
    // existing landing.
    const isEngineerOrCco = memberships.some((m) => ["ENGINEER", "CCO"].includes(m.memberType));
    const isMinimalOnly =
      roleCodes.length > 0 &&
      roleCodes.every((c: string) => MINIMAL_FLOOR_ROLE_CODES.includes(c)) &&
      memberships.length === 0 &&
      !isSuperAdmin;

    // Single active session -- bump sessionVersion so any token issued by a
    // previous login (a different device/browser still holding an
    // unexpired an_token) fails the check in getEnrichedSession and gets
    // logged out on its next request.
    const sessionVersion = (user.sessionVersion || 0) + 1;
    await User.updateOne({ _id: user._id }, { $set: { sessionVersion } });

    /* ── Build JWT payload ───────────────────────────────────────────── */
    const token = signToken({
      id:               user._id.toString(),
      email:            user.email,
      name:             user.name || user.username || "User",
      role:             user.role || "USER",
      isSuperAdmin,
      isPlatformStaff,
      businessIds,
      activeBusinessId,
      organizationId:   user.organizationId?.toString(),
      mustChangePassword: !!user.mustChangePassword,
      sessionVersion,
    });

    const safeUser = {
      id:               user._id.toString(),
      email:            user.email,
      name:             user.name,
      username:         user.username,
      role:             user.role,
      isSuperAdmin,
      isPlatformStaff,
      businessIds,
      activeBusinessId,
      organizationId:   user.organizationId?.toString(),
      mustChangePassword: !!user.mustChangePassword,
      isMinimalOnly,
      homeRoute,
      hasVendorAccess,
      isEngineerOrCco,
    };

    /* ── Set httpOnly cookie + return token in JSON ──────────────────── */
    const res = NextResponse.json({ success: true, token, user: safeUser });

    res.cookies.set("an_token", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 7, // 7 days
      path:     "/",
    });

    return res;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
