import { NextResponse } from "next/server";
import { connectDB } from "@/core/db/mongodb";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { listModulesForBusiness } from "@/core/module-registry/moduleDefinition.service";
import { filterModulesByPermission } from "@/core/access/filterModulesByPermission";
import { expandWithAliases } from "@/core/access/moduleKeyAliases";
import { STATIC_MODULES } from "@/components/sidebar-nav";

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
    const modules = [...dbModules, ...staticCandidates];

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

    // SC (Service Center) businesses are single-login, workorder-first by
    // spec, but still share the modules every operating mode has in
    // common -- BOM, Inventory (when serialization is enabled), Reports,
    // Settings and Profile, per explicit direction ("All the category
    // parts will have BOM in common, Inventory (If they Enable
    // Serialization) Reports and setting and profile view pages"). So the
    // collapse keeps that common set alongside the workorder screen,
    // rather than showing ONLY crm_jobsheets. Applied last, after every
    // other filter, so it always wins regardless of what permissions/
    // business-module config would otherwise have shown. Exempts a super
    // admin, who needs full nav to administer every business.
    if (business?.operatingMode === "SC" && !session.isSuperAdmin) {
      const scAllowedKeys = new Set([
        "crm",
        "crm_jobsheets",
        "material-catalog",
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
        "send-feedback",
        ...(business?.inventorySerialized ? ["inventory", "stock-transfers", "inventory-lots"] : []),
      ]);
      visibleModules = visibleModules.filter((m: any) => scAllowedKeys.has(m.key));
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
