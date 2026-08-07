import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { connectDB } from "@/core/db/mongodb";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { listModulesForBusiness } from "@/core/module-registry/moduleDefinition.service";
import { filterModulesByPermission } from "@/core/access/filterModulesByPermission";
import { expandWithAliases } from "@/core/access/moduleKeyAliases";
import { STATIC_MODULES } from "@/components/sidebar-nav";
import { getAllowedModuleKeysForBusiness } from "@/core/pricing/planAccess";
import { resolveAllowedPageKeys, ALWAYS_ALLOWED_KEYS } from "@/lib/access/centralAllowedPages";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { getVendorOnboardingConfig } from "@/lib/centralApiRead";

/**
 * MIGRATED from UserBusinessAccess/accessKeys to the Permission-based access
 * system, per the full cutover decision recorded in PROGRESS.md. Access is
 * now: User -> UserRole -> Role -> RolePermission -> Permission (already-
 * built and working via getEnrichedSession(), just not previously connected
 * to the sidebar) crossed against ModuleDefinition (the new module
 * registry) instead of Business.modules[].access + UserBusinessAccess.
 *
 * See scripts/migrateAccessKeysToPermissions.ts for the one-time data
 * migration that converts existing UserBusinessAccess.accessKeys grants
 * into equivalent Role/RolePermission grants, so nobody's current access
 * silently disappears when this route starts checking the new system.
 * That migration MUST be run (once, in production, after this deploys)
 * before this cutover is safe — see PROGRESS.md for status.
 */
export async function POST(req: Request) {
  try {
    await connectDB();

    const { businessId } = await req.json();

    if (!businessId) {
      return NextResponse.json(
        { success: false, message: "businessId is required" },
        { status: 400 }
      );
    }

    const session = await getEnrichedSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const business = await Business.findById(businessId).lean() as any;
    if (!business) {
      return NextResponse.json(
        { success: false, message: "Business not found" },
        { status: 404 }
      );
    }

    const dbModules = await listModulesForBusiness(businessId);
    // Every real nav item (STATIC_MODULES, derived from sidebar.tsx's own
    // NAV_GROUPS) is always a candidate too, not just whatever happens to
    // have a matching ModuleDefinition row in the DB -- dozens of sidebar
    // items (User Management, Access Control, Employees, Assets, Designs,
    // Solutions, and many more) never had a ModuleDefinition seeded for
    // them at all, across several partial/inconsistent seed scripts, so
    // they could never appear in the sidebar no matter what permissions a
    // role held. This unions in every sidebar key not already covered by
    // a real (possibly business-custom) ModuleDefinition, self-healing the
    // gap with no separate seeding step required.
    const dbKeys = new Set(dbModules.map((m) => m.key));
    const staticCandidates = STATIC_MODULES.filter((m) => !dbKeys.has(m.key)).map((m) => ({
      key: m.key,
      label: m.label,
      route: m.route,
      icon: m.icon,
      enabled: true,
    }));
    // A ModuleDefinition row that already exists in the database (e.g.
    // hand-created via the old /console/module-builder UI, since removed)
    // can carry a route that's gone stale after a code-level page move --
    // the console/* restructure into sc/pos/brand/common/admin moved
    // dozens of routes, but a DB row's own `route` field has no way to
    // follow along automatically, and dbKeys.has(key) above means the
    // corrected STATIC_MODULES entry for that same key never even gets
    // considered. Route (and label/icon, so a stale DB label doesn't hang
    // around either) is treated as code-owned for any key STATIC_MODULES
    // still recognizes -- the DB row still governs enabled/permissions/
    // everything else. Without this, a page move in code silently stops
    // fixing already-seeded businesses' sidebars.
    const staticByKey = new Map(STATIC_MODULES.map((m) => [m.key, m]));
    const modules = [...dbModules, ...staticCandidates].map((m: any) => {
      const known = staticByKey.get(m.key);
      return known ? { ...m, route: known.route, label: known.label, icon: known.icon } : m;
    });

    let visibleModules = filterModulesByPermission(
      modules,
      session.permissions,
      session.isSuperAdmin
    );

    // Per-business module-access config (Business.ts's `modules` field,
    // editable from admin/business/[id]'s "Modules" section, or bulk-set by
    // an "Apply Template" button per moduleTemplates.ts) — a second,
    // independent gate on top of the permission-based ModuleDefinition
    // filter above. Applies to EVERYONE, including super admins: this gate
    // is about which pages are RELEVANT to the active business (an
    // e-commerce business shouldn't show CRM workorders; AN Group shouldn't
    // show a shop's Products page), not a security boundary -- permission
    // checks (the isSuperAdmin bypass above, and requirePermission() on the
    // actual API routes) remain the only access-control gate. Without this,
    // switching the active business never changed a super admin's own menu.
    //
    // DENY-list, not allow-list: a module key this business's modules[]
    // has never heard of (true for most keys, for most businesses -- most
    // module keys were added to the platform after most businesses' saved
    // modules[] array) must stay visible, not silently disappear from the
    // sidebar. Also now expands through the sidebar-key <-> real-
    // permission-key alias map (moduleKeyAliases.ts) before comparing --
    // `modules` here is keyed by the real ModuleDefinition key (e.g.
    // "settings") while `business.modules[]` is saved under the sidebar's
    // UI key (e.g. "admin-settings"); comparing them directly with no
    // alias step meant several real modules could never match a saved
    // toggle at all, in either direction.
    const businessModules = Array.isArray(business?.modules) ? business.modules : [];
    if (businessModules.length > 0) {
      const rawDisabledKeys = businessModules
        .filter((m: any) => m?.enabled === false)
        .map((m: any) => String(m?.key).toLowerCase());
      if (rawDisabledKeys.length > 0) {
        const disabledKeys = expandWithAliases(rawDisabledKeys);
        // Platform-level tools (AI Studio, Admin Settings) aren't a
        // per-business catalog concern the way Products/CRM are -- a
        // business's modules[] deny-list disabling them (deliberately or
        // by an unrelated bulk "Apply Template") shouldn't be able to hide
        // them from the one account that always needs them. Reported live:
        // both were simply "not there" for a super admin.
        const superAdminAlwaysVisible = new Set(["ai-image", "admin-settings"]);
        visibleModules = visibleModules.filter((m: any) => {
          const key = String(m.key).toLowerCase();
          if (session.isSuperAdmin && superAdminAlwaysVisible.has(key)) return true;
          return !disabledKeys.has(key);
        });
      }
    }

    // Vendor-type-aware module restriction: a single business (e.g. "My
    // Biz Flow") can host BRAND/SC/POS vendors together, so this can no
    // longer key off Business.operatingMode -- that collapsed EVERY
    // user's sidebar in a mixed business to whatever one mode happened to
    // be set, regardless of which type of vendor was actually logged in.
    // Keyed on the CALLING USER's own vendor type (VendorProfile.appliedAs
    // via resolveVendorContext) instead. Central-api's vendorTypeModules
    // (Access tab, per business, editable per appliedAs) is the primary
    // source -- "if I add pages to it those pages only reflect here to
    // people with that type" -- so an admin can grant/restrict BRAND/POS
    // the same way SC already was, without a code change. The hardcoded
    // SC set below is kept ONLY as the safety-net default for SC when no
    // central config has been set yet, preserving existing behavior.
    const vendorContext = session.isSuperAdmin ? null : await resolveVendorContext(session.user.id);
    const appliedAs = (vendorContext?.vendor as any)?.appliedAs as string | undefined;
    if (appliedAs && !session.isSuperAdmin) {
      const onboardingConfig = await getVendorOnboardingConfig(businessId);
      const centralEntry = onboardingConfig?.vendorTypeModules?.find((v) => v.appliedAs === appliedAs);
      // No central config yet: only SC has a safety-net default (preserves
      // pre-existing behavior). BRAND/POS with no central config configured
      // yet are left unrestricted here rather than guessing a wrong list.
      const defaultKeys = appliedAs === "SC" ? [
        "sc_jobsheets",
        "sc-masters-brands",
        "sc-masters-solutions",
        "material-catalog",
        // Customer directory (view who's been serviced, contact details,
        // ledger balance) -- was missing entirely, so SC had no way to
        // browse its own customers outside a job sheet/invoice.
        "customers",
        // Revenue from closed workorders is billed through SalesInvoice
        // (see crmJobsheetAccess/close route), so Sales and Stock
        // Adjustments (consuming BOM parts against on-hand quantity) are
        // relevant to every SC shop, not just ones with serial-tracked
        // inventory -- only the serial-specific pages stay gated below.
        "sales",
        "stock-adjustments",
        "reports",
        "report-builder",
        "analytics",
        "admin-settings",
        "admin-plan",
        "sub-accounts",
        // Documents SC can also generate directly (not only via a
        // workorder close) -- Quotations/Estimates before repair,
        // Delivery Challans when handing a device to a courier, Credit/
        // Debit Notes for adjustments.
        "quotations",
        "delivery-challans",
        "credit-notes",
        "debit-notes",
        "proforma-invoices",
        ...(business?.inventorySerialized ? ["inventory", "stock-transfers"] : []),
      ] : [];
      const typeAllowedKeys = centralEntry?.moduleKeys?.length ? centralEntry.moduleKeys : defaultKeys;
      if (typeAllowedKeys.length > 0) {
        const typeAllowedSet = new Set(typeAllowedKeys);
        visibleModules = visibleModules.filter((m: any) => typeAllowedSet.has(m.key));
      }
    }

    // Central-api role's allowedPages -- a SEPARATE, admin-configured
    // restriction layered on top of everything above (see
    // lib/access/centralAllowedPages.ts's own comment). Never applied to
    // a super admin. A null return (no central role recorded, role not
    // in the catalog, or no pages configured for it yet) means "don't
    // additionally restrict" -- this can only ever narrow visibleModules
    // further, and only once an admin has actually configured a role's
    // pages via the Roles & Access business-settings panel.
    if (!session.isSuperAdmin) {
      const headersList = await nextHeaders();
      const centralRole = headersList.get("x-central-role");
      const allowedPageKeys = await resolveAllowedPageKeys(businessId, centralRole);
      if (allowedPageKeys) {
        visibleModules = visibleModules.filter(
          (m: any) => ALWAYS_ALLOWED_KEYS.has(m.key) || allowedPageKeys.has(m.key)
        );
      }
    }

    // Plan-gating: a module a business is otherwise permitted to see can
    // still be hidden if their current plan (Subscription.plan, or Basic
    // while on trial) doesn't include it -- see core/pricing/planAccess.ts.
    // Exempts a super admin, same as every other filter above.
    if (business?.operatingMode && !session.isSuperAdmin) {
      const allowedKeys = await getAllowedModuleKeysForBusiness(String(business._id), business.operatingMode);
      if (allowedKeys) {
        const allowedSet = new Set(allowedKeys);
        visibleModules = visibleModules.filter((m: any) => allowedSet.has(m.key));
      }
    }

    if (visibleModules.length === 0 && !session.isSuperAdmin) {
      // No visible modules at all — treat the same as the old "access
      // denied" case rather than silently showing an empty sidebar, since
      // that was the original route's behavior for a user with no grants.
      return NextResponse.json(
        { success: false, message: "Access denied" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      business: {
        id: business._id,
        name: business.name,
        legalName: business.legalName,
        brandName: business.brandName,
        businessCode: business.businessCode,
      },
      modules: visibleModules,
    });
  } catch (err: any) {
    console.error("SIDEBAR API ERROR:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
