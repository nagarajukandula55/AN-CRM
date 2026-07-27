/**
 * ONE-TIME SEED: system ModuleDefinition rows for every built-in business
 * module that exists in the original repo's live sidebar.
 *
 * Context: listModulesForBusiness() (src/core/module-registry/moduleDefinition.service.ts)
 * reads ModuleDefinition documents (businessId: null = platform-wide system
 * module). Nothing has ever written those rows, so the new sidebar/module
 * registry has been structurally correct but empty — no system modules to
 * return, which blocks testing the whole cutover (module registry, access
 * matrix, permission auto-sync, migrated sidebar route) end-to-end.
 *
 * SOURCE OF TRUTH for keys/labels/routes/icons: the original repo's live
 * sidebar component (src/components/sidebar.tsx), NOT business.service.ts's
 * DEFAULT_MODULES (which only covered 5 modules — dashboard/ai/logistics/
 * analytics/settings — a much smaller, unrelated legacy template used only
 * when creating a brand new Business document). sidebar.tsx is what actually
 * decides what an admin sees today, and is also what PROGRESS.md's "Full
 * module/feature inventory" checklist was built from. Every top-level and
 * nested entry there is represented below — nothing from that inventory is
 * silently dropped. business.service.ts's DEFAULT_MODULES (ai/logistics/
 * analytics/settings) is ALSO included even though those 4 keys weren't in
 * the live sidebar originally — per explicit user confirmation, all 4 are
 * real, needed modules (ai hosts ANu, logistics/analytics are real business
 * domains, settings is the admin config hub) and are now fully built (see
 * src/app/admin/{ai,logistics,analytics,settings}/page.tsx) and enabled by
 * default, routed under /admin/* like every other module. Nested/grouped entries (e.g. HR sub-items, admin
 * sub-items) become their own flat modules with their own route + permission
 * codes, same as their parent siblings, since ModuleDefinition has no
 * built-in grouping concept yet (grouping is a nav/UI concern, layered on
 * top of this flat list later if needed — not blocking for this seed step).
 *
 * Each module gets isSystem: true, businessId: null (platform-wide, visible
 * to every business — matches how sidebar.tsx already behaved: one fixed
 * nav tree for every business, not a per-business customized one). Safe to
 * run more than once: upserts by {key, businessId: null}, does not
 * duplicate or overwrite hand-edited fields like `enabled` on re-run.
 *
 * applicableActions is intentionally left unset (undefined) for every
 * module here, which per core/access/actions.ts's resolveActionsForModule()
 * means "all STANDARD_ACTIONS apply" (view/create/edit/delete/export/
 * approve/manage_settings) — the safest default for a first seed pass.
 * Admins can narrow individual modules later via updateModuleDefinition().
 *
 * HOW TO RUN (after this deploys, before/alongside the access-key migration
 * so the new sidebar has real data to serve):
 *   npx tsx scripts/seedSystemModules.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import ModuleDefinition from "../src/core/module-registry/ModuleDefinition.model";
import { syncPermissionsForModule, syncSuperAdminRole } from "../src/core/access/permissionSync.service";

interface SeedModule {
  key: string;
  label: string;
  pluralLabel: string;
  route: string;
  icon: string;
  sortOrder: number;
  /** Optional subset of STANDARD_ACTIONS keys; undefined = all apply. */
  applicableActions?: string[];
}

// Order matches sidebar.tsx's nav order exactly, so sortOrder produces the
// same visual ordering admins already expect.
const SYSTEM_MODULES: SeedModule[] = [
  { key: "dashboard", label: "Dashboard", pluralLabel: "Dashboard", route: "/admin", icon: "LayoutDashboard", sortOrder: 10 },

  { key: "orders", label: "Order", pluralLabel: "Orders", route: "/admin/orders", icon: "ShoppingBag", sortOrder: 20 },
  { key: "sales", label: "Sale", pluralLabel: "Sales", route: "/admin/sales", icon: "TrendingUp", sortOrder: 21 },
  { key: "coupons", label: "Coupon", pluralLabel: "Coupons", route: "/admin/coupons", icon: "Hash", sortOrder: 22 },

  { key: "inventory", label: "Inventory Item", pluralLabel: "Inventory", route: "/admin/inventory", icon: "Package", sortOrder: 30 },
  { key: "products", label: "Product", pluralLabel: "Products", route: "/admin/products", icon: "Box", sortOrder: 31 },
  { key: "warehouses", label: "Warehouse", pluralLabel: "Warehouses", route: "/admin/warehouses", icon: "Building2", sortOrder: 32 },
  { key: "materials", label: "Material", pluralLabel: "Materials", route: "/admin/materials", icon: "Box", sortOrder: 33 },

  { key: "purchase", label: "Purchase", pluralLabel: "Purchases", route: "/admin/purchase", icon: "ShoppingCart", sortOrder: 40 },
  { key: "purchase_orders", label: "Purchase Order", pluralLabel: "Purchase Orders", route: "/admin/purchase-orders", icon: "ShoppingCart", sortOrder: 41 },

  { key: "bom", label: "Bill of Materials", pluralLabel: "Bills of Materials", route: "/admin/bom", icon: "Box", sortOrder: 50 },
  { key: "production", label: "Production Run", pluralLabel: "Production", route: "/admin/production", icon: "Package", sortOrder: 51 },

  { key: "finance", label: "Finance Record", pluralLabel: "Finance", route: "/admin/finance", icon: "DollarSign", sortOrder: 60 },

  { key: "businesses", label: "Business", pluralLabel: "Businesses", route: "/admin/business", icon: "Building2", sortOrder: 70 },
  { key: "vendors", label: "Vendor", pluralLabel: "Vendors", route: "/admin/vendors", icon: "Truck", sortOrder: 71 },
  { key: "vendor_products", label: "Vendor Product", pluralLabel: "Vendor Products", route: "/admin/vendor-products", icon: "Truck", sortOrder: 72 },

  { key: "hr", label: "HR Overview", pluralLabel: "HR Overview", route: "/admin/hr", icon: "UserCheck", sortOrder: 80 },
  { key: "employees", label: "Employee", pluralLabel: "Employees", route: "/admin/employees", icon: "Users", sortOrder: 81 },
  { key: "hr_leave", label: "Leave", pluralLabel: "Leave", route: "/admin/hr/leave", icon: "UserCheck", sortOrder: 82 },
  { key: "hr_payroll", label: "Payroll", pluralLabel: "Payroll", route: "/admin/hr/payroll", icon: "DollarSign", sortOrder: 83 },

  { key: "crm", label: "Lead", pluralLabel: "CRM", route: "/admin/crm", icon: "UserPlus", sortOrder: 90 },

  { key: "agreements", label: "Agreement", pluralLabel: "Agreements", route: "/admin/agreements", icon: "FileSignature", sortOrder: 100 },
  { key: "document_numbers", label: "Document Number Config", pluralLabel: "Document Numbers", route: "/admin/document-numbers", icon: "Hash", sortOrder: 101 },

  { key: "social", label: "Social Post", pluralLabel: "Social Media", route: "/admin/social", icon: "Share2", sortOrder: 110 },
  { key: "ai_image", label: "AI Image", pluralLabel: "AI Studio", route: "/admin/ai-image", icon: "Sparkles", sortOrder: 111 },
  { key: "designs", label: "Design", pluralLabel: "Designs", route: "/admin/designs", icon: "Sparkles", sortOrder: 112 },

  { key: "chat", label: "Chat Message", pluralLabel: "Team Chat", route: "/admin/chat", icon: "MessageSquare", sortOrder: 120 },
  { key: "notifications", label: "Notification", pluralLabel: "Notifications", route: "/admin/notifications", icon: "Bell", sortOrder: 121 },

  { key: "users", label: "User", pluralLabel: "User Management", route: "/admin/users", icon: "UserCog", sortOrder: 130 },
  { key: "access", label: "Access Grant", pluralLabel: "Access Control", route: "/admin/access", icon: "Key", sortOrder: 131 },
  { key: "roles", label: "Role", pluralLabel: "Roles & Permissions", route: "/admin/roles", icon: "Shield", sortOrder: 132 },

  { key: "integrations", label: "Integration", pluralLabel: "Integrations", route: "/admin/integrations", icon: "Plug", sortOrder: 140 },
  { key: "sso", label: "SSO Config", pluralLabel: "SSO / Auth", route: "/admin/sso", icon: "Key", sortOrder: 141 },
  { key: "system_status", label: "System Status", pluralLabel: "System Status", route: "/admin/system-status", icon: "Activity", sortOrder: 142 },

  { key: "stock_adjustments", label: "Stock Adjustment", pluralLabel: "Stock Adjustments", route: "/admin/stock-adjustments", icon: "Package", sortOrder: 150 },
  { key: "stock_transfers", label: "Stock Transfer", pluralLabel: "Stock Transfers", route: "/admin/stock-transfers", icon: "Package", sortOrder: 151 },

  // The following 4 keys originally came from business.service.ts's
  // DEFAULT_MODULES template (used only when a brand-new Business document
  // is created) rather than sidebar.tsx, and had no real admin/* route.
  // RESOLVED per explicit user decision: all 4 are real, needed modules —
  // "ai" hosts ANu (the in-house AI assistant), "logistics" and "analytics"
  // are real business domains, and "settings" is the admin configuration
  // hub (business profile / document numbering / integrations / AI keys).
  // All 4 are now fully built (see src/app/admin/{ai,logistics,analytics,
  // settings}/page.tsx + their backing API routes) and enabled by default —
  // no longer placeholders. Routes point at /admin/* to match every other
  // module's convention (the old DEFAULT_MODULES template used root-level
  // routes like "/ai", which are now orphaned and can eventually be deleted
  // once confirmed nothing external links to them).
  { key: "ai", label: "AI Workspace", pluralLabel: "AI Workspace", route: "/admin/ai", icon: "Brain", sortOrder: 900 },
  { key: "logistics", label: "Logistics", pluralLabel: "Logistics", route: "/admin/logistics", icon: "Truck", sortOrder: 901 },
  { key: "analytics", label: "Analytics", pluralLabel: "Analytics", route: "/admin/analytics", icon: "BarChart3", sortOrder: 902 },
  { key: "settings", label: "Setting", pluralLabel: "Settings", route: "/admin/settings", icon: "Settings", sortOrder: 903 },

  // Added during the permission-code convention migration: app/api/audit/logs
  // was already a LIVE route (audit.view / audit.create checks) with no
  // backing ModuleDefinition at all — a real module-registry gap, not just
  // a naming-convention mismatch. Added so AUDIT.VIEW / AUDIT.CREATE resolve
  // to a real seeded module like every other permission code does.
  { key: "audit", label: "Audit Log", pluralLabel: "Audit Logs", route: "/admin/audit", icon: "History", sortOrder: 160, applicableActions: ["view", "create", "export"] },

  // Added per explicit user request: GST filing — pushing invoices directly
  // to the GST portal, plus ANu assisting with GST processes and pending
  // filings. This is the UI/permission surface for that; see core/gst/ for
  // the service layer.
  { key: "gst", label: "GST Filing", pluralLabel: "GST Filing", route: "/admin/gst", icon: "Landmark", sortOrder: 161 },
];

async function main() {
  await connectDB();

  const results: { key: string; action: "created" | "already existed" }[] = [];

  for (const mod of SYSTEM_MODULES) {
    const existing = await ModuleDefinition.findOne({ key: mod.key, businessId: null });

    if (existing) {
      results.push({ key: mod.key, action: "already existed" });
      continue;
    }

    const created = await ModuleDefinition.create({
      key: mod.key,
      label: mod.label,
      pluralLabel: mod.pluralLabel,
      description: "",
      icon: mod.icon,
      route: mod.route,
      isSystem: true,
      businessId: null,
      fields: [], // built-in modules keep using their existing typed Mongoose models for record storage;
                  // ModuleDefinition here only drives sidebar visibility + permission generation,
                  // NOT record storage via ModuleRecord (that's reserved for admin-defined custom modules
                  // per ModuleRecord.model.ts's documented scope). Fields can be filled in later if/when
                  // a built-in module's data entry also moves to the dynamic-field UI.
      // Was hardcoded to `undefined` here, silently ignoring any per-module
      // applicableActions declared above (e.g. "audit"'s view/create/export
      // subset) — every module got the full STANDARD_ACTIONS set regardless
      // of what was actually declared. Fixed to pass the declared value
      // through; still resolves to "all actions" for modules that don't
      // declare one, since resolveActionsForModule() treats undefined that way.
      applicableActions: mod.applicableActions,
      sortOrder: mod.sortOrder,
      enabled: true,
    });

    // Auto-generate this module's grantable permissions immediately, exactly
    // like the custom-module creation path does — so system modules are
    // just as easy to grant access to as admin-created ones, no special case.
    await syncPermissionsForModule(created);

    results.push({ key: mod.key, action: "created" });
  }

  // Keep the Super Admin role's permissions array holding every permission
  // that exists after this run -- never leave it blank/stale.
  await syncSuperAdminRole();

  console.log(`\nSeeded ${SYSTEM_MODULES.length} system modules:`);
  console.table(results);

  const createdCount = results.filter((r) => r.action === "created").length;
  const skippedCount = results.filter((r) => r.action === "already existed").length;
  console.log(
    `\n${createdCount} created, ${skippedCount} already existed (skipped, not duplicated).`
  );
  console.log(
    "\nNext: run scripts/migrateAccessKeysToPermissions.ts (if not already run) so " +
    "existing users actually hold the VIEW permissions these modules now require " +
    "to appear in their sidebar."
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
