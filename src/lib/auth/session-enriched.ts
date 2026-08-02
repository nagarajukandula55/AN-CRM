import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { resolveMembershipForUser } from "./business-context";
import User from "@/models/User";
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";
import RolePermission from "@/models/RolePermission";
import Permission from "@/models/Permission";
import Business from "@/models/Business";
import VendorProfile from "@/models/VendorProfile";
import { expandWithAliases } from "@/core/access/moduleKeyAliases";
import { getOrCreateANGroupBusinessId } from "@/core/access/anGroupBusiness.service";
import { getVendorAvailableModules, permissionCodesForModules } from "@/core/access/vendorAccess.service";
import { isSubscriptionBlocked } from "@/core/subscriptions/checkAccess";

/**
 * =========================================================
 * ENRICHED ERP SESSION (SINGLE SOURCE OF TRUTH)
 * =========================================================
 * Reads user identity from request headers injected by the
 * custom JWT middleware (src/middleware.ts). The middleware
 * verifies the an_token cookie and injects:
 *   x-user-id, x-user-email, x-user-name,
 *   x-user-role, x-is-super-admin
 * =========================================================
 */

export interface IEnrichedSession {
  user: {
    id: string;
    name: string;
    email: string;
  };

  business: {
    businessId: string;
    organizationId: string;
    membershipId: string;
  } | null;

  roles: string[];
  permissions: string[];

  isSuperAdmin: boolean;

  // True when the active business's subscription/trial has expired --
  // see core/subscriptions/checkAccess.ts. Never true for a super admin
  // (they must always retain access to fix things). Checked by
  // requirePermission() so this is enforced everywhere that already calls
  // it, not just a handful of manually-updated routes.
  subscriptionBlocked: boolean;
}

/**
 * Build full enriched session from JWT middleware headers.
 * Falls back to DB lookup for roles/permissions if business context exists.
 */
export async function getEnrichedSession(): Promise<IEnrichedSession | null> {
  const headersList = await headers();

  const userId = headersList.get("x-user-id");
  const userEmail = headersList.get("x-user-email");
  const userName = headersList.get("x-user-name") || "";
  const userRole = headersList.get("x-user-role") || "";
  const isSuperAdmin = headersList.get("x-is-super-admin") === "true";

  // Not authenticated — middleware didn't inject headers
  if (!userId || !userEmail) return null;

  // This function runs its own Mongoose queries (User.findOne, UserRole.find,
  // etc. below) but never established a connection itself -- every call site
  // was relied on to have already called connectDB() first, and several
  // called this BEFORE connectDB() (see e.g. api/crm/jobsheets/route.ts).
  // On a cold serverless instance (first request after idle -- routine on
  // Vercel) that ordering raced the connection: the queries below either
  // threw (silently swallowed by the .catch(() => null) guards further
  // down) or ran against a connection still establishing, resolving to an
  // empty user/permissions object -- which requirePermission() then
  // legitimately reports as 401/403 even though the account really does
  // have access. This is very likely the "sometimes even though they have
  // access, getting forbidden errors" symptom reported in practice.
  // connectDB() caches its connection promise (see lib/mongodb.ts), so
  // calling it here on every request is cheap once actually connected.
  await connectDB();

  const tokenSessionVersionHeader = headersList.get("x-session-version");

  // This function runs on nearly every authenticated request, so trimming
  // its round-trips to MongoDB matters app-wide, not just here. It used to
  // fetch the User document TWICE (once inside getBusinessContext(), again
  // a few lines below for the role/permission lookup) and only fetched
  // anGroupId after the roles/permissions chain was already underway, all
  // fully sequential. Now fetches user + anGroupId together up front
  // (independent of each other) and reuses that one `user` for both the
  // business-context resolution and the role lookup below.
  const [user, anGroupId] = await Promise.all([
    User.findOne({ email: userEmail }).lean().catch(() => null),
    getOrCreateANGroupBusinessId().catch(() => null),
  ]);

  // Single active session -- a token issued by an earlier login (still
  // unexpired, held by a different device/browser) carries a stale
  // sessionVersion once a newer login has bumped User.sessionVersion.
  // Reject it here rather than at the Edge middleware, which has no DB
  // access to compare against.
  if (
    user &&
    tokenSessionVersionHeader !== null &&
    Number(tokenSessionVersionHeader) !== ((user as any).sessionVersion || 0)
  ) {
    return null;
  }

  const activeBusinessIdHeader = headersList.get("x-active-business-id");

  // Try to get business context (sets businessId, organizationId, membershipId)
  let businessContext: Awaited<ReturnType<typeof resolveMembershipForUser>> = null;
  try {
    if (user) {
      businessContext = await resolveMembershipForUser((user as any)._id, activeBusinessIdHeader);
    }
  } catch {
    // business-context not available in this request (e.g. no cookie)
  }

  // ── DB lookup for roles & permissions scoped to this user ──────────────
  // Was gated behind `if (!businessContext) return early`, so any user with
  // no active BusinessMember (every brand-new self-registered customer, by
  // definition) always resolved to permissions: [] regardless of whatever
  // UserRole rows they actually had. UserRole.businessId is optional, so this
  // lookup is intentionally businessId-agnostic -- only the `business` field
  // on the returned session stays conditional on business context.
  let roles: string[] = userRole ? [userRole] : [];
  let permissions: string[] = [];

  // Only depends on businessContext (resolved above), not on the role/
  // permission chain below -- was previously kicked off only AFTER that
  // whole chain finished (behind a `permissions.length > 0` check that
  // itself waited on it), adding a full extra sequential round trip to
  // every single authenticated request for no reason. Runs concurrently
  // with the role/permission resolution instead; both are awaited before
  // the module-based permission filter is applied below.
  const businessModulesPromise =
    !isSuperAdmin && businessContext?.businessId
      ? Business.findById(businessContext.businessId).select("modules operatingMode").lean().catch(() => null)
      : Promise.resolve(null);

  try {
    if (user) {
      // Was filtering on `isActive: true`, but UserRole has no `isActive`
      // field at all (see models/UserRole.ts) -- every query here matched
      // zero documents, for every user, unconditionally. This single line
      // silently broke permission resolution for the entire app: every
      // non-super-admin permission check has always resolved to an empty
      // `permissions` array and failed, since super-admin's unconditional
      // bypass in permission.guard.ts is the only thing that ever made a
      // requirePermission() call succeed in this codebase so far.
      const userRoles = await UserRole.find({
        userId: (user as any)._id,
      }).lean();

      const roleIds = userRoles.map((r: any) => r.roleId);

      if (roleIds.length > 0) {
        let rolesDocs = await Role.find({ _id: { $in: roleIds } }).lean();

        // (The old "self-heal the global MANAGER role" block that lived
        // here is gone: per the final architecture there are NO default
        // roles -- a global all-permission MANAGER must never be silently
        // recreated. Every role is created explicitly, per business, by
        // the Super Admin from Admin > Access.)

        // Cross-business role leak: a Role scoped to Business A (via its
        // own businessId) was still granting its permissions to a user
        // even while their ACTIVE session business was Business B -- this
        // block only ever unioned every UserRole the person holds,
        // regardless of which one's business context they're currently
        // in. A role is now only "live" in a session when it's either
        // platform-wide (businessId null, or AN Group's own real business
        // id -- see anGroupBusiness.service.ts) or matches the session's
        // actual active business. Skipped entirely when there's no active
        // business context at all (e.g. still picking one) -- in that
        // state only platform-wide roles apply.
        const activeBizId = businessContext?.businessId ? String(businessContext.businessId) : null;
        rolesDocs = rolesDocs.filter((r: any) => {
          const roleBiz = r.businessId ? String(r.businessId) : null;
          if (!roleBiz || roleBiz === anGroupId) return true; // platform-wide
          return activeBizId ? roleBiz === activeBizId : false;
        });

        roles = rolesDocs.map((r: any) => r.code);

        // Two independent, non-overlapping permission storage conventions
        // exist in this codebase: the relational RolePermission -> Permission
        // join (queried below) and Role.permissions (a flat string[] set
        // directly via buildPermissionCode(), which is what every route
        // this session actually grants through -- e.g. the vendor "Full
        // Access" role, the coupons role, etc.). Reading only the relational
        // join meant any role using the flat-array convention (effectively
        // all of them) still resolved to zero permissions even after the
        // isActive fix above. Union both sources so neither convention is
        // silently ignored.
        const flatPermissions = rolesDocs.flatMap((r: any) =>
          Array.isArray(r.permissions) ? r.permissions : []
        );

        // VENDOR_OWNER/VENDOR_MANAGER are meant to always mean "every
        // module currently available to this vendor" (see
        // vendorAccess.service.ts's own comment on those two roles) -- but
        // the stored Role.permissions array above is only a SNAPSHOT,
        // written once by ensureVendorCoreRoles() at role-creation time
        // (or a manual re-sync). Every module added to VENDOR_MODULE_KEYS
        // since then (Settings, Integrations, Material Catalog's alias --
        // all fixed this session) never reaches an already-existing
        // vendor's stored role, so it stays invisible/forbidden no matter
        // what the code now says it should grant. Reproduced live,
        // repeatedly, as "Settings still not in sidebar" even after the
        // module-availability fix. Recomputed live here instead of
        // trusting the stale snapshot -- self-healing, no separate
        // re-sync step required, same pattern as STATIC_MODULES's own
        // self-heal in api/ui/sidebar/route.ts.
        const vendorStructuralRoles = rolesDocs.filter((r: any) =>
          typeof r.code === "string" && (r.code.startsWith("VENDOR_OWNER") || r.code.startsWith("VENDOR_MANAGER")) && r.vendorId
        );
        const liveVendorPermissions: string[] = [];
        for (const roleDoc of vendorStructuralRoles) {
          const vendorForRole = await VendorProfile.findById((roleDoc as any).vendorId)
            .select("appliedAs")
            .lean<any>()
            .catch(() => null);
          const available = await getVendorAvailableModules(
            String((roleDoc as any).businessId),
            vendorForRole?.appliedAs
          ).catch(() => []);
          liveVendorPermissions.push(...permissionCodesForModules(available.map((m) => m.key)));
        }

        const rolePermissions = await RolePermission.find({
          roleId: { $in: rolesDocs.map((r: any) => r._id) },
        }).lean();

        const permissionIds = rolePermissions.map((p: any) => p.permissionId);

        let relationalPermissions: string[] = [];
        if (permissionIds.length > 0) {
          const permissionDocs = await Permission.find({
            _id: { $in: permissionIds },
          }).lean();
          relationalPermissions = permissionDocs.map((p: any) => p.code);
        }

        permissions = Array.from(new Set([...flatPermissions, ...relationalPermissions, ...liveVendorPermissions]));
      }
    }
  } catch {
    // DB models may not be available; fall back to header-based role
    roles = userRole ? [userRole] : [];
  }

  // Cross-check against the active business's enabled modules
  // (Business.modules[]) -- this was previously enforced ONLY at the
  // sidebar (api/ui/sidebar/route.ts intersects a role's permitted modules
  // with the business's enabled ones before deciding what to show), never
  // at actual API enforcement. A role granting e.g. "FINANCE.VIEW" could
  // still call the real finance API successfully even after a super admin
  // disabled the Finance module for that specific business -- the module
  // toggle was cosmetic (hid the nav link) rather than a real access
  // boundary. Super admins are exempt (requirePermission already bypasses
  // them unconditionally; filtering here would just be wasted work).
  //
  // This used to build an ALLOW-list from whatever keys happened to be
  // present in businessModules[] once that array was non-empty -- but a
  // module key ABSENT from the array (never explicitly toggled either way)
  // then got silently treated as disabled, not "not yet configured". Most
  // businesses' modules[] predates most of the module keys that exist
  // today (assets/customers/designs/employees/solutions/crm/settings/
  // integrations/users/roles/access/gst/... were all added well after
  // this platform's businesses were first configured), so this was
  // quietly 403ing real users on every module their business's saved
  // array had never heard of -- exactly the "many pages missing" reports.
  // Now builds a DENY-list instead: only a module EXPLICITLY saved with
  // enabled:false gets stripped; everything else (including keys the
  // array has no opinion on) stays granted.
  // SC is architecturally single-login with NO role concept at all --
  // "there is no roles and only single login will be there... we need to
  // give all the access to single ID only" (explicit direction, distinct
  // from BRAND which does have Manager/CCO/Engineer roles). Whatever role
  // documents that login happens to hold (or doesn't) is irrelevant for
  // an SC business: grant every operational module this business hasn't
  // explicitly disabled, same module set a vendor Owner/Manager would
  // get (getVendorAvailableModules already excludes platform-admin-only
  // modules like Users/Roles/Businesses, which SC has no use for either).
  // This replaces relying on a Role document actually holding the right
  // permissions for an SC login -- the same root-cause class as the
  // Settings/Integrations staleness bug fixed earlier, just for a
  // business type that was never meant to route through Role/Permission
  // at all.
  if (!isSuperAdmin && businessContext?.businessId) {
    try {
      const business = await businessModulesPromise;
      if ((business as any)?.operatingMode === "SC") {
        const available = await getVendorAvailableModules(String(businessContext.businessId)).catch(() => []);
        permissions = Array.from(new Set([...permissions, ...permissionCodesForModules(available.map((m) => m.key))]));
      }
    } catch {
      // Fall through -- an SC login keeps whatever it already resolved
      // above rather than losing access entirely if this lookup fails.
    }
  }

  if (!isSuperAdmin && businessContext?.businessId && permissions.length > 0) {
    try {
      const business = await businessModulesPromise;
      const businessModules = Array.isArray((business as any)?.modules) ? (business as any).modules : [];
      if (businessModules.length > 0) {
        const rawDisabledKeys = businessModules
          .filter((m: any) => m?.enabled === false)
          .map((m: any) => String(m?.key).toLowerCase());
        if (rawDisabledKeys.length > 0) {
          // Expand through the sidebar-key <-> real-permission-key alias map
          // (see moduleKeyAliases.ts) before uppercasing to match
          // buildPermissionCode's module-key casing -- otherwise disabling
          // a masters page under its sidebar key wouldn't strip its real
          // permission code's module key (or vice versa).
          const disabledKeys = new Set(
            Array.from(expandWithAliases(rawDisabledKeys)).map((k) => k.toUpperCase())
          );
          permissions = permissions.filter((code) => {
            const moduleKey = code.split(".")[0];
            return !disabledKeys.has(moduleKey);
          });
        }
      }
    } catch {
      // If this lookup fails, fall through with the unfiltered permission
      // list rather than breaking every permission check platform-wide.
    }
  }

  // Never blocks a super admin (must always retain access to fix things)
  // or a request with no resolved business context at all.
  const subscriptionBlocked =
    !isSuperAdmin && businessContext?.businessId
      ? await isSubscriptionBlocked(businessContext.businessId).catch(() => false)
      : false;

  return {
    user: { id: userId, name: userName, email: userEmail },
    business: businessContext
      ? {
          businessId: businessContext.businessId,
          organizationId: businessContext.organizationId,
          membershipId: businessContext.membershipId,
        }
      : null,
    roles,
    permissions,
    isSuperAdmin,
    subscriptionBlocked,
  };
}
