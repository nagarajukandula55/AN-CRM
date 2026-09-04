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
import VendorSubscription from "@/models/VendorSubscription";
import { buildPermissionCode, STANDARD_ACTIONS } from "./actions";
import { ACCESS_HIERARCHY, ModuleEntry } from "./moduleHierarchy";
import { expandWithAliases } from "./moduleKeyAliases";
import { stripFloorRoles } from "./floorRoles.service";
import { getVendorOnboardingConfig } from "@/lib/centralApiRead";

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
  // Ledger Book/P&L/Expenses only -- split out of "finance" (which stays
  // Pro-tier for invoicing/documents/statement) so these three can be
  // gated to Ultimate only. See core/pricing/plans.ts vendorModuleKeys.
  "finance-advanced",
  // Quotations/Credit Notes/Debit Notes/Proforma Invoices/Delivery
  // Challans/Credit Accounts -- also split out of "finance" (which stays
  // Starter-tier for plain GST/non-GST invoicing only), Pro+ only. Was
  // sharing "finance" with plain invoicing, which meant Starter's public
  // feature list said these were Pro-only while a Starter vendor's own
  // VendorSubscription.modules already technically granted them.
  "finance-extra",
  "gst",
  "crm",
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
  // Per-business Settings page (Terms & Conditions, Device Types,
  // Inventory Serialization/GST toggles, default labour charge, etc.) --
  // missing here meant a vendor Owner/Manager could NEVER be granted
  // SETTINGS.VIEW, so the sidebar's "admin-settings" entry stayed
  // invisible no matter what was toggled in Business > Modules (that
  // toggle only controls a business's own opt-in/opt-out, not whether
  // the module can be granted to a vendor role at all). Reported live,
  // repeatedly, as "Settings not in sidebar" for a Service Center account.
  "settings",
  // Integrations (Telegram/WhatsApp/Email/SMS gateway config) -- a vendor
  // needs to configure their OWN SMS/WhatsApp credentials for the
  // customer-facing workorder-status alerts and NPS follow-up (see
  // lib/customerNotify.ts) without needing a Super Admin to do it for
  // them every time.
  "integrations",
  // Customer directory -- was excluded even though every vendor's own
  // customers (from job sheets/invoices) need to be browsable.
  "customers",
  // Reports/Report Builder/Analytics -- already listed in SC's sidebar
  // allowlist (api/ui/sidebar/route.ts) but never actually grantable, so
  // the module never passed filterModulesByPermission's REPORTS.VIEW
  // check and stayed invisible/forbidden regardless of that allowlist.
  // "report-builder" aliases to "reports" (see moduleKeyAliases.ts).
  "reports",
  "analytics",
  // The SC Settings page (and its saved Brand/Model/Payment-Collector
  // suggestion lists) saves via PATCH /api/businesses/[id], which
  // enforces BUSINESSES.EDIT -- excluded above as "platform admin", but
  // that route already scopes a non-super-admin caller to only the
  // business they're an ACTIVE member of (see its own membership check),
  // so granting this to a vendor Owner/Manager (or an SC login) doesn't
  // widen access to any OTHER business, only their own. Without this,
  // every Settings save and every "add new" Brand/Model/Collector-name
  // save silently 403'd -- reported live as "brand added via the modal
  // wasn't available next time" and "model list isn't being recorded."
  "businesses",
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
 *
 * When `vendorId` is given AND that vendor has a VendorSubscription with a
 * non-empty `modules` list configured (Super Admin set pricing for them --
 * see models/VendorSubscription.ts), the result is further intersected
 * down to just those modules. Per explicit direction ("once trial ends
 * after payment only they can avail the services they opted for based on
 * plan and pricing") -- VendorSubscription.modules was previously read
 * ONLY for computing the invoice amount, never actually enforced as an
 * access boundary, so a vendor who paid for 3 modules still had the same
 * full business-wide module access as before paying for anything. No
 * VendorSubscription (or one with an empty modules list, meaning pricing
 * hasn't been configured for this vendor yet) applies no extra
 * restriction, same permissive-by-default fallback every other filter
 * here already uses.
 */
export async function getVendorAvailableModules(
  businessId: string,
  appliedAs?: string,
  vendorId?: string
): Promise<ModuleEntry[]> {
  const business = await Business.findById(businessId)
    .select("modules vendorTypeModules")
    .lean<any>();
  const businessModules = Array.isArray(business?.modules) ? business.modules : [];
  const disabled = expandWithAliases(
    businessModules
      .filter((m: any) => m?.enabled === false)
      .map((m: any) => String(m?.key).toLowerCase())
  );

  const vendorKeys = new Set<string>(VENDOR_MODULE_KEYS);
  let result = flattenHierarchy().filter((m) => vendorKeys.has(m.key) && !disabled.has(m.key));

  // Per-vendor-type restriction: central-api is the single source of
  // truth for this (its own dashboard's Access tab), shared across every
  // consuming app -- checked first; Business.vendorTypeModules (local) is
  // only the fallback for when central-api is unreachable/not yet
  // configured for this business, not the primary store anymore. If this
  // business has an entry for `appliedAs` with a non-empty moduleKeys
  // list, intersect the result down to just those keys. No entry (or an
  // empty list) for this type = no extra restriction.
  if (appliedAs) {
    let typeEntries = Array.isArray(business?.vendorTypeModules) ? business.vendorTypeModules : [];
    const centralConfig = await getVendorOnboardingConfig(businessId);
    if (centralConfig) typeEntries = centralConfig.vendorTypeModules;

    const typeEntry = typeEntries.find(
      (t: any) => String(t?.appliedAs).toUpperCase() === String(appliedAs).toUpperCase()
    );
    if (typeEntry && Array.isArray(typeEntry.moduleKeys) && typeEntry.moduleKeys.length > 0) {
      const allowed = new Set<string>(typeEntry.moduleKeys.map((k: any) => String(k)));
      result = result.filter((m) => allowed.has(m.key));
    }
  }

  if (vendorId) {
    const subscription = await VendorSubscription.findOne({ vendorId }).select("modules").lean<any>();
    if (subscription && Array.isArray(subscription.modules) && subscription.modules.length > 0) {
      const paidFor = new Set<string>(subscription.modules.map((m: any) => String(m.key)));
      result = result.filter((m) => paidFor.has(m.key));
    }
  }

  return result;
}

/**
 * Server-side check for a single plan-gated vendor module (e.g.
 * "finance-advanced" for Ledger/P&L/Expenses -- see core/pricing/plans.ts's
 * vendorModuleKeys). The vendor-portal NAV already hides these, but the API
 * routes behind them had no check of their own -- someone hitting the URL
 * directly could bypass the plan tier entirely. Returns true when the
 * vendor's current plan includes moduleKey (or when no VendorSubscription
 * exists yet at all, same permissive-by-default fallback
 * getVendorAvailableModules already uses everywhere else).
 */
export async function vendorHasModule(
  businessId: string,
  vendorId: string,
  moduleKey: string,
  appliedAs?: string
): Promise<boolean> {
  const available = await getVendorAvailableModules(businessId, appliedAs, vendorId);
  return available.some((m) => m.key === moduleKey);
}

export function permissionCodesForModules(modules: string[]): string[] {
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
export async function ensureVendorCoreRoles(
  vendorProfileId: string,
  businessId: string,
  appliedAs?: string
): Promise<void> {
  const available = await getVendorAvailableModules(businessId, appliedAs, vendorProfileId);
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

  // Bound by this vendor's own type (BRAND/SC/POS) restriction, if the
  // business has configured one -- not just the business-wide set.
  const vendorProfile = await VendorProfile.findById(vendorId).select("appliedAs").lean<any>();
  const appliedAs = vendorProfile?.appliedAs;

  // SC vendors are single-ID only, by explicit direction -- the applicant
  // who signed up IS the whole account, no staff/team beneath them (unlike
  // BRAND/POS, where the Owner/Manager can build out a team). Any grant
  // attempt for an SC vendor (from the vendor's own Team & Access UI, or an
  // admin) is rejected outright, not just filtered down to zero modules --
  // the caller should never have offered this in the first place.
  if (appliedAs === "SC") {
    throw new Error("This vendor is single-ID only (SC) -- staff access cannot be granted.");
  }

  // Never allow a grant outside what this vendor's business makes
  // available — the UI only offers valid options, but the API enforces it
  // independently.
  const available = new Set(
    (await getVendorAvailableModules(businessId, appliedAs)).map((m) => m.key)
  );
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
    await ensureVendorCoreRoles(vendorId, businessId, appliedAs);
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
  ENGINEER: ["crm_jobsheets", "brands", "device_models", "fault_codes", "solutions"],
  // CCO used to get crm_calls (Appointments) only, no crm_jobsheets --
  // Calls were removed from the product, so CCO now gets crm_jobsheets
  // instead so this role keeps real CRM access rather than losing it.
  CCO: ["crm_jobsheets", "brands", "device_models", "fault_codes", "solutions"],
  CENTRE_MANAGER: ["crm_jobsheets", "brands", "device_models", "fault_codes", "solutions"],
};

// Anyone holding ONLY these floor roles has no admin-panel business at all
// -- see api/auth/login/route.ts's original comment. Duplicated here (not
// imported from there) since that file is a route handler, not a module
// other code should import from.
export const MINIMAL_FLOOR_ROLE_CODES = ["CUSTOMER_SHOPNATIVE", "CUSTOMER_ANGROUP"];

/**
 * The ONE place that decides where a logged-in user should land --
 * shared by api/auth/login/route.ts (right after a fresh login) AND
 * api/auth/landing/route.ts (every other time the app needs to know,
 * e.g. the root "/" page for a user who is already authenticated via
 * cookie and never re-submits the login form). Having two separate
 * copies of this logic is exactly how the root page's hardcoded
 * `router.replace('/console')` went stale the moment the vendor-team
 * redirect fix landed only in the login route -- Engineer/CCO accounts
 * that opened the app fresh (not via the login form) kept landing on
 * /console because the root page never got the same rule.
 */
export async function resolveLandingPath(userId: string, isSuperAdmin: boolean): Promise<string> {
  if (isSuperAdmin) return "/console";

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
  const ownerOrManagerVendor = await resolveOwnerOrManagerVendor(userId).catch(() => null);
  const hasVendorAccess = memberships.some((m) => !!m.vendorId) || !!ownerOrManagerVendor;
  // SC vendors have no vendor-portal experience -- they land on the
  // console Dashboard like any other console user, reaching the SC
  // workorder screen via the sidebar's Workorders link instead (see
  // login/page.tsx's identical branch -- this function covers the SAME
  // landing decision for a return visit via /api/auth/landing).
  if (ownerOrManagerVendor && (ownerOrManagerVendor as any).appliedAs === "SC") {
    return "/console";
  }
  if (hasVendorAccess) return "/vendor";

  const homeRoute = grantedRoles.find((r) => r.homeRoute && !MINIMAL_FLOOR_ROLE_CODES.includes(r.code))?.homeRoute;
  return homeRoute || "/console";
}
