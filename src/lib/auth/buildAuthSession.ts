import BusinessMember from "@/models/BusinessMember";
import Business from "@/models/Business";
import UserRole from "@/models/UserRole";
import Role from "@/models/Role";
import VendorProfile from "@/models/VendorProfile";
import { signToken } from "@/lib/auth/jwt";
import { resolveOwnerOrManagerVendor } from "@/core/access/vendorAccess.service";

// Anyone holding ONLY these floor roles has no admin-panel business at
// all -- they should never see the /console shell, just their own storefront
// account (shopnative.in for now; angroup.in has no customer-facing UI of
// its own yet, so it also lands there).
const MINIMAL_FLOOR_ROLE_CODES = ["CUSTOMER_SHOPNATIVE", "CUSTOMER_ANGROUP"];

/**
 * Everything that turns an already-authenticated local `User` doc into a
 * signed an_token + the safeUser payload the client/login page reads to
 * decide where to land -- memberships, centralRole, isSuperAdmin,
 * isPlatformStaff, homeRoute, vendor access, pendingVendorApplication,
 * sessionVersion bump. Extracted out of api/auth/login/route.ts (which
 * still owns password verification, both central-api and the local-bcrypt
 * lazy-migration fallback) so api/auth/sso/callback/route.ts -- which
 * authenticates a user by a different means entirely (a central-api SSO
 * token, no password check here at all) -- can issue an IDENTICAL session
 * instead of re-deriving this same ~200 lines a second time and risking
 * the two paths silently drifting apart.
 */
export async function buildAuthSession(
  user: any,
  centralBusinessAccess: { businessId: string; role: string }[]
): Promise<{ token: string; safeUser: Record<string, unknown> }> {
  /* ── Load business memberships from BusinessMember collection ────── */
  const memberships = (await BusinessMember.find({
    userId: user._id,
    status: "ACTIVE",
  })
    .select("businessId isDefaultBusiness memberType vendorId")
    .sort({ createdAt: -1 })
    .lean()
    .exec()) as any[];

  const businessIds: string[] = memberships.map((m) => m.businessId.toString());

  let activeBusinessId: string | undefined;
  const defaultMembership = memberships.find((m) => m.isDefaultBusiness);
  if (defaultMembership) {
    activeBusinessId = defaultMembership.businessId.toString();
  } else if (user.defaultBusinessId) {
    activeBusinessId = user.defaultBusinessId.toString();
  } else if (businessIds.length > 0) {
    activeBusinessId = businessIds[0];
  }

  let centralRole: string | null = null;
  if (activeBusinessId && centralBusinessAccess.length > 0 && process.env.CENTRAL_API_URL) {
    try {
      const bizRes = await fetch(
        `${process.env.CENTRAL_API_URL}/api/v1/businesses?search=${encodeURIComponent(`sourceId:${activeBusinessId}`)}&limit=1`,
        { headers: { "x-api-key": process.env.CENTRAL_API_KEY || "" } }
      );
      const bizBody = await bizRes.json().catch(() => null);
      const centralBusinessId = bizBody?.items?.[0]?._id;
      if (centralBusinessId) {
        centralRole = centralBusinessAccess.find((a) => a.businessId === centralBusinessId)?.role || null;
      }
    } catch (err) {
      console.error("[buildAuthSession] failed to resolve centralRole:", (err as any)?.message || err);
    }
  }

  const isSuperAdmin = user.role === "SUPER_ADMIN";

  const userRoleDocs = (await UserRole.find({ userId: user._id }).lean().exec()) as any[];
  const grantedRoles = userRoleDocs.length
    ? ((await Role.find({ _id: { $in: userRoleDocs.map((r) => r.roleId) } })
        .select("code homeRoute businessId vendorId permissions")
        .lean()
        .exec()) as any[])
    : [];
  const roleCodes = grantedRoles.map((r) => r.code);
  const isPlatformStaff =
    isSuperAdmin ||
    grantedRoles.some(
      (r) => !r.businessId && !r.vendorId && !MINIMAL_FLOOR_ROLE_CODES.includes(r.code) && (r.permissions?.length || 0) > 0
    );
  let homeRoute = grantedRoles.find((r) => r.homeRoute && !MINIMAL_FLOOR_ROLE_CODES.includes(r.code))?.homeRoute || null;

  if (activeBusinessId && !isSuperAdmin) {
    const activeBusiness = await Business.findById(activeBusinessId).select("operatingMode").lean<any>();
    if (activeBusiness?.operatingMode === "SC") {
      homeRoute = "/console/sc/dashboard";
    } else if (activeBusiness?.operatingMode === "POS" && !homeRoute) {
      homeRoute = "/console/pos/dashboard";
    }
  }

  const ownerOrManagerVendor = await resolveOwnerOrManagerVendor(user._id.toString()).catch(() => null);
  const hasVendorAccess = memberships.some((m) => !!m.vendorId) || !!ownerOrManagerVendor;
  const isEngineerOrCco = memberships.some((m) => ["ENGINEER", "CCO"].includes(m.memberType));
  // SC vendors have no vendor-portal experience at all -- the single-
  // screen workorder flow they actually use lives in the console app
  // (/console/crm/jobsheets/sc, vendor-type-gated), not /vendor. Only
  // matters for an Owner/Manager (isEngineerOrCco already routes staff
  // elsewhere) -- captured here so login/page.tsx can branch the landing
  // path without a second lookup.
  const vendorAppliedAs = (ownerOrManagerVendor as any)?.appliedAs || null;

  const pendingVendorApplication = !hasVendorAccess
    ? await VendorProfile.findOne({
        email: user.email,
        isDeleted: false,
        status: { $nin: ["ACTIVE", "APPROVED", "REJECTED"] },
      })
        .select("_id")
        .lean()
    : null;

  const isMinimalOnly =
    roleCodes.length > 0 &&
    roleCodes.every((c: string) => MINIMAL_FLOOR_ROLE_CODES.includes(c)) &&
    memberships.length === 0 &&
    !isSuperAdmin &&
    !pendingVendorApplication;

  const sessionVersion = (user.sessionVersion || 0) + 1;
  const User = (await import("@/models/User")).default;
  await User.updateOne({ _id: user._id }, { $set: { sessionVersion } });

  const token = signToken({
    id: user._id.toString(),
    email: user.email,
    name: user.name || user.username || "User",
    role: user.role || "USER",
    isSuperAdmin,
    isPlatformStaff,
    businessIds,
    activeBusinessId,
    organizationId: user.organizationId?.toString(),
    mustChangePassword: !!user.mustChangePassword,
    sessionVersion,
    centralRole,
  });

  const safeUser = {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    username: user.username,
    role: user.role,
    isSuperAdmin,
    isPlatformStaff,
    businessIds,
    activeBusinessId,
    organizationId: user.organizationId?.toString(),
    mustChangePassword: !!user.mustChangePassword,
    isMinimalOnly,
    homeRoute,
    hasVendorAccess,
    isEngineerOrCco,
    vendorAppliedAs,
    pendingVendorApplication: !!pendingVendorApplication,
  };

  return { token, safeUser };
}
