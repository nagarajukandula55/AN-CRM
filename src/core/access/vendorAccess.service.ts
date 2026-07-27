/**
 * Vendor staff access — the ONE mechanism by which a vendor's Owner or
 * Manager grants working access to their team, per the final access
 * architecture:
 *
 *   AN Group (platform)
 *     └─ Businesses (each with its own enabled-module selection)
 *          └─ Vendors (Owner structural via VendorProfile.userId;
 *             Manager granted; Super Admin attaches users to the team)
 *               └─ Staff (granted one or MANY module accesses by the
 *                  vendor's Owner/Manager from the vendor profile page)
 *
 * Instead of a fixed laundry list of pre-baked roles, each staff member
 * gets a PERSONAL role document (code `VSTAFF_<userId>`, scoped to
 * {businessId, vendorId}) whose permission set is derived directly from
 * the module checkboxes the Owner/Manager ticked. Granting/revoking is a
 * single upsert; the existing enforcement chain (UserRole -> Role ->
 * session permissions -> requirePermission) is completely unchanged, so
 * every API/permission fix made this session keeps applying as-is.
 */
import Role, { RoleStatus, RoleType } from "@/models/Role";
import UserRole from "@/models/UserRole";
import VendorProfile from "@/models/VendorProfile";
import BusinessMember from "@/models/BusinessMember";
import Business from "@/models/Business";
import { buildPermissionCode, STANDARD_ACTIONS } from "./actions";
import { ACCESS_HIERARCHY, ModuleEntry } from "./moduleHierarchy";
import { expandWithAliases } from "./moduleKeyAliases";
import { stripFloorRoles } from "./floorRoles.service";

/** Modules a vendor's team can ever be granted — operational modules only.
 * Platform/administration modules (businesses, users, roles, access,
 * settings, integrations, HR, customers-at-large, coupons) are deliberately
 * excluded: those belong to AN Group / business administration, never to a
 * vendor's staff, no matter what a business has enabled. */
export const VENDOR_MODULE_KEYS = [
  "sales",
  "reviews",
  "inventory",
  "products",
  "product_categories",
  "materials",
  "bom",
  "grn",
  "warehouses",
  "stock_transfers",
  "stock_adjustments",
  "purchase",
  "vendor_products",
  "logistics",
  "finance",
  "gst",
  "crm",
  "crm_calls",
  "crm_jobsheets",
  "fault_codes",
  "solutions",
  "banners",
  "blog",
  "staff",
  // Read-only masters needed for the Brand/Model dropdowns on the
  // Appointment/Workorder create/convert forms.
  "brands",
  "device_models",
] as const;

const ALL_ACTION_KEYS = STANDARD_ACTIONS.map((a) => a.key);

function flattenHierarchy(): ModuleEntry[] {
  const out: ModuleEntry[] = [];
  for (const cat of ACCESS_HIERARCHY) {
    for (const m of cat.modules ?? []) out.push(m);
    for (const sc of cat.subcategories ?? []) out.push(...sc.modules);
  }
  return out;
}

/**
 * The modules a vendor under `businessId` can be granted: the vendor
 * module set, minus anything this business has EXPLICITLY disabled in
 * Business > Modules (deny-list convention — a key the business's saved
 * modules[] has never heard of stays available; see session-enriched.ts's
 * matching filter for why absent must never mean disabled).
 */
export async function getVendorAvailableModules(businessId: string): Promise<ModuleEntry[]> {
  const business = await Business.findById(businessId).select("modules").lean<any>();
  const businessModules = Array.isArray(business?.modules) ? business.modules : [];
  const disabled = expandWithAliases(
    businessModules
      .filter((m: any) => m?.enabled === false)
      .map((m: any) => String(m?.key).toLowerCase())
  );

  const vendorKeys = new Set<string>(VENDOR_MODULE_KEYS);
  return flattenHierarchy().filter((m) => vendorKeys.has(m.key) && !disabled.has(m.key));
}

function permissionCodesForModules(modules: string[]): string[] {
  const codes: string[] = [];
  for (const moduleKey of modules) {
    for (const action of ALL_ACTION_KEYS) {
      codes.push(buildPermissionCode(moduleKey, action));
    }
  }
  return codes;
}

/**
 * The two structural vendor roles — Owner and Manager. Owner is whoever
 * can log in AS the vendor (VendorProfile.userId); Manager is granted by
 * the Owner (or Super Admin) and can do everything the Owner can inside
 * the vendor portal, including managing staff access. Both get full
 * access to every module available to this vendor's business.
 *
 * This REPLACES the old 11-role generated set (Finance Assistant,
 * Warehouse Helper, Front Office, Engineer, ...) — per the rebuilt
 * architecture, staff access is granted per-module per-user by the
 * vendor, not picked from a fixed menu of job titles.
 */
export async function ensureVendorCoreRoles(vendorProfileId: string, businessId: string): Promise<void> {
  const available = await getVendorAvailableModules(businessId);
  const codes = permissionCodesForModules(available.map((m) => m.key));

  for (const def of [
    { code: "VENDOR_OWNER", name: "Owner", description: "Full access to every module available to this vendor." },
    { code: "VENDOR_MANAGER", name: "Manager", description: "Full access, including managing staff and their access." },
  ]) {
    await Role.updateOne(
      { code: def.code, businessId, vendorId: vendorProfileId },
      {
        $setOnInsert: {
          code: def.code,
          businessId,
          vendorId: vendorProfileId,
          name: def.name,
          description: def.description,
          type: RoleType.SYSTEM,
          status: RoleStatus.ACTIVE,
          isSystem: true,
          isProtected: true,
        },
        // Refreshed on every call so an already-onboarded vendor's
        // Owner/Manager tracks the business's current module selection.
        $set: { permissions: codes },
      },
      { upsert: true }
    );
  }
}

const STAFF_ROLE_PREFIX = "VSTAFF_";

/**
 * Grant (or update) a staff member's access: `modules` is exactly the set
 * of module keys this user should hold — a single access or many
 * ("vendor can give either single access to user or multiple access").
 * Passing an empty array revokes everything. `isManager` grants/revokes
 * the vendor's Manager role on top.
 */
export async function grantVendorStaffAccess(opts: {
  userId: string;
  businessId: string;
  vendorId: string;
  modules: string[];
  isManager?: boolean;
  grantedBy?: string;
}): Promise<void> {
  const { userId, businessId, vendorId, modules, isManager, grantedBy } = opts;

  // Never allow a grant outside what this vendor's business makes
  // available — the UI only offers valid options, but the API enforces it
  // independently.
  const available = new Set((await getVendorAvailableModules(businessId)).map((m) => m.key));
  const granted = modules.filter((m) => available.has(m));

  const staffRoleCode = `${STAFF_ROLE_PREFIX}${userId}`.toUpperCase();

  if (granted.length > 0) {
    const role = await Role.findOneAndUpdate(
      { code: staffRoleCode, businessId, vendorId },
      {
        $setOnInsert: {
          code: staffRoleCode,
          businessId,
          vendorId,
          name: "Staff Access",
          type: RoleType.CUSTOM,
          status: RoleStatus.ACTIVE,
          isSystem: true, // not editable from the generic roles UI
        },
        $set: {
          permissions: permissionCodesForModules(granted),
          description: `Per-user staff access: ${granted.join(", ")}`,
        },
      },
      { upsert: true, new: true }
    );
    await UserRole.updateOne(
      { userId, roleId: role._id },
      { $setOnInsert: { userId, roleId: role._id, businessId, assignedBy: grantedBy } },
      { upsert: true }
    );
    // Real access granted -> the registration floor (shopnative view) is
    // removed; the user retains exactly what was added.
    await stripFloorRoles(userId);
  } else {
    // Empty grant = revoke: remove the personal role and its link.
    const role = await Role.findOne({ code: staffRoleCode, businessId, vendorId });
    if (role) {
      await UserRole.deleteMany({ roleId: role._id });
      await role.deleteOne();
    }
  }

  // Manager toggle — grants/revokes the vendor's structural Manager role.
  if (typeof isManager === "boolean") {
    await ensureVendorCoreRoles(vendorId, businessId);
    const managerRole = await Role.findOne({ code: "VENDOR_MANAGER", businessId, vendorId });
    if (managerRole) {
      if (isManager) {
        await UserRole.updateOne(
          { userId, roleId: managerRole._id },
          { $setOnInsert: { userId, roleId: managerRole._id, businessId, assignedBy: grantedBy } },
          { upsert: true }
        );
        await stripFloorRoles(userId);
      } else {
        await UserRole.deleteMany({ userId, roleId: managerRole._id });
      }
    }
  }
}

/**
 * Per-user access map for a vendor's whole team, for the Team & Access UI
 * AND for vendor/layout.tsx's nav-item visibility filtering.
 *
 * Was built ONLY from the per-user VSTAFF_<userId> personal roles
 * (grantVendorStaffAccess's module-checkbox mechanism) plus the vendor's
 * own VENDOR_MANAGER role -- once a vendor could also assign one of the
 * business's own custom roles (CCO, Engineer, business-wide "Manager",
 * etc. -- see the vendorId-union fix in api/vendor/staff/route.ts) directly
 * to a staff member, that grant carried real permissions (session-
 * enriched.ts sees it fine) but this map had no idea it existed, so the
 * matching sidebar item never showed up even though the API calls behind
 * it would have worked. Now unions modules from EVERY role any team member
 * actually holds, not just the two known mechanisms.
 */
export async function getVendorStaffAccessMap(
  vendorId: string,
  businessId: string
): Promise<Record<string, { modules: string[]; isManager: boolean }>> {
  const members = await BusinessMember.find({ vendorId, businessId, status: "ACTIVE", isDeleted: { $ne: true } })
    .select("userId")
    .lean();
  const memberIds = members.map((m: any) => m.userId);
  if (memberIds.length === 0) return {};

  const userRoles = await UserRole.find({ userId: { $in: memberIds } }).select("userId roleId").lean();
  const roleIds = Array.from(new Set(userRoles.map((r: any) => String(r.roleId))));
  const roleDocs = await Role.find({ _id: { $in: roleIds } }).select("code permissions").lean();
  const roleById = new Map(roleDocs.map((r: any) => [String(r._id), r]));

  const map: Record<string, { modules: string[]; isManager: boolean }> = {};
  for (const grant of userRoles as any[]) {
    const role = roleById.get(String(grant.roleId));
    if (!role) continue;
    const uid = String(grant.userId).toLowerCase();
    const modules = (role.permissions || []).map((p: string) => p.split(".")[0].toLowerCase());
    const isManager = role.code === "VENDOR_MANAGER" || role.code === "MANAGER";
    if (!map[uid]) map[uid] = { modules: [], isManager: false };
    map[uid].modules = Array.from(new Set([...map[uid].modules, ...modules]));
    if (isManager) map[uid].isManager = true;
  }

  return map;
}

/**
 * Owner-or-Manager resolution for vendor-side management endpoints —
 * structural Owner (VendorProfile.userId) or a real granted Manager
 * UserRole. Never the free-text BusinessMember.vendorRole label. Shared
 * here so every vendor management surface uses the same definition.
 *
 * "Manager" here means either this vendor's own generated VENDOR_MANAGER
 * role, OR a business-wide role literally coded MANAGER (vendorId unset)
 * -- Super Admin's Attach-to-vendor flow (api/admin/users/[id]/promote's
 * VENDOR_TEAM track) explicitly allows granting either kind in the same
 * step (see that route's own comment), so a vendor-team member holding
 * the business's plain "Manager" role is just as much this vendor's
 * Manager as someone holding the auto-generated VENDOR_MANAGER role --
 * restricting recognition to only the latter left that whole grant path
 * producing someone attached to the vendor's team but 404'd/redirected
 * out of every /vendor/* page and management endpoint. Confirmed against
 * production: manager@vendor.com holds exactly this shape (BusinessMember
 * with vendorId set, UserRole -> the business-wide MANAGER role) and
 * failed this resolver before this fix.
 */
export async function resolveOwnerOrManagerVendor(userId: string | null) {
  if (!userId) return null;
  const ownedVendor = await VendorProfile.findOne({ userId, isDeleted: { $ne: true } }).lean();
  if (ownedVendor) return ownedVendor;

  const membership = await BusinessMember.findOne({
    userId,
    vendorId: { $ne: null },
    status: "ACTIVE",
  }).lean();
  if (!membership?.vendorId) return null;

  const managerRoles = await Role.find({
    code: { $in: ["VENDOR_MANAGER", "MANAGER"] },
    businessId: membership.businessId,
    $or: [{ vendorId: membership.vendorId }, { vendorId: null }],
  }).select("_id").lean();
  if (managerRoles.length === 0) return null;

  const hasManagerRole = await UserRole.exists({
    userId,
    roleId: { $in: managerRoles.map((r: any) => r._id) },
  });
  if (!hasManagerRole) return null;

  return VendorProfile.findById(membership.vendorId).lean();
}

/**
 * ANY active vendor-team member (Owner/Manager/CCO/Engineer/etc.), not
 * just Owner/Manager -- same lookup vendor/layout.tsx's own page guard
 * uses. Distinct from resolveOwnerOrManagerVendor above: that one gates
 * actual staff MANAGEMENT (add/remove staff, change roles), while this
 * one is for read-only "which vendor's team am I on" checks, e.g. so a
 * CCO/Engineer's own workorder/appointment list can scope to their team
 * without needing Owner/Manager-level access.
 */
export async function resolveVendorTeamMembership(userId: string | null) {
  if (!userId) return null;
  const ownedVendor = await VendorProfile.findOne({ userId, isDeleted: { $ne: true } }).lean();
  if (ownedVendor) return ownedVendor;

  const membership = await BusinessMember.findOne({
    userId,
    vendorId: { $ne: null },
    status: "ACTIVE",
    isDeleted: { $ne: true },
  }).lean();
  if (!membership?.vendorId) return null;

  return VendorProfile.findById(membership.vendorId).lean();
}

/**
 * Module read-access implied by a vendor staff member's memberType, used
 * when tagging service-center staff (CCO/Engineer/Centre Manager) --
 * previously duplicated (and out of sync with each other) across
 * api/vendor/staff/create/route.ts and api/vendor/staff/route.ts. Missing
 * "fault_codes" and "solutions" here is why an Engineer/CCO's workorder
 * repair page could never load the Symptom dropdown (api/symptom-codes)
 * or the Description/BOM-part dropdown (api/service-center-bom) --
 * both of those routes check buildPermissionCode("fault_codes", "view")
 * (same as api/fault-codes itself; not a typo, just a shared permission
 * bucket for this whole "repair reference data" category), and Solution
 * needs its own real "solutions" module. Fault Phenomenon had the exact
 * same gap and silently showed no options either, just less noticeably
 * since a job sheet's own faultCodeId still displayed even with an empty
 * options list to match it against.
 */
export const MEMBER_TYPE_IMPLIED_MODULES: Record<string, string[]> = {
  ENGINEER: ["crm_calls", "crm_jobsheets", "brands", "device_models", "fault_codes", "solutions"],
  CCO: ["crm_calls", "brands", "device_models", "fault_codes", "solutions"],
  CENTRE_MANAGER: ["crm_calls", "crm_jobsheets", "brands", "device_models", "fault_codes", "solutions"],
};

// Anyone holding ONLY these floor roles has no admin-panel business at all
// -- see api/auth/login/route.ts's original comment. Duplicated here (not
// imported from there) since that file is a route handler, not a module
// other code should import from.
const MINIMAL_FLOOR_ROLE_CODES = ["CUSTOMER_SHOPNATIVE", "CUSTOMER_ANGROUP"];

/**
 * The ONE place that decides where a logged-in user should land --
 * shared by api/auth/login/route.ts (right after a fresh login) AND
 * api/auth/landing/route.ts (every other time the app needs to know,
 * e.g. the root "/" page for a user who is already authenticated via
 * cookie and never re-submits the login form). Having two separate
 * copies of this logic is exactly how the root page's hardcoded
 * `router.replace('/admin')` went stale the moment the vendor-team
 * redirect fix landed only in the login route -- Engineer/CCO accounts
 * that opened the app fresh (not via the login form) kept landing on
 * /admin because the root page never got the same rule.
 */
export async function resolveLandingPath(userId: string, isSuperAdmin: boolean): Promise<string> {
  if (isSuperAdmin) return "/admin";

  const memberships = await BusinessMember.find({ userId, status: "ACTIVE" })
    .select("vendorId")
    .lean() as any[];

  const userRoleDocs = await UserRole.find({ userId }).lean() as any[];
  const grantedRoles = userRoleDocs.length
    ? await Role.find({ _id: { $in: userRoleDocs.map((r) => r.roleId) } }).select("code homeRoute").lean() as any[]
    : [];
  const roleCodes = grantedRoles.map((r) => r.code);

  const isMinimalOnly =
    roleCodes.length > 0 &&
    roleCodes.every((c: string) => MINIMAL_FLOOR_ROLE_CODES.includes(c)) &&
    memberships.length === 0;
  if (isMinimalOnly) return "https://shopnative.in";

  // Any vendor-team member (Owner/Manager/CCO/Engineer/etc.) belongs on
  // /vendor no matter what a business-wide role they ALSO happen to hold
  // sets as its own homeRoute -- see resolveOwnerOrManagerVendor's own
  // comment for the manager@vendor.com example this guards against.
  const hasVendorAccess =
    memberships.some((m) => !!m.vendorId) ||
    !!(await resolveOwnerOrManagerVendor(userId).catch(() => null));
  if (hasVendorAccess) return "/vendor";

  const homeRoute = grantedRoles.find((r) => r.homeRoute && !MINIMAL_FLOOR_ROLE_CODES.includes(r.code))?.homeRoute;
  return homeRoute || "/admin";
}
