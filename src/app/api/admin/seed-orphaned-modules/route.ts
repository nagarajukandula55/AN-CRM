/**
 * POST/GET /api/admin/seed-orphaned-modules
 *
 * Seeds ModuleDefinition + Permission rows for two DIFFERENT but related
 * problems found during a repo-wide access audit:
 *
 * 1. Pages that are fully built and working but completely unreachable from
 *    the nav — the exact bug this codebase's own comments already document
 *    for a few individual pages (Invoice Branding, GST, Document
 *    Templates), found here to affect many more: Masters (Units, Brands,
 *    Product/Material Categories, Vendor Directory), Stock ops (Transfers,
 *    Adjustments, Lots), Vendor Products approval queue, Analytics, ANu
 *    Assistant, Logistics, HR Documents, Settings, Pincode Data.
 *
 * 2. A SEPARATE, more serious problem: several live API routes
 *    (gst/config, gst/filings, dashboard/overview, organization/create,
 *    audit/logs, finance/invoices, finance/payments, purchase/orders,
 *    inventory/items|movements|grn) call
 *    requirePermission(session, buildPermissionCode(key, action)) for
 *    module keys ("gst", "dashboard", "businesses", "audit", "finance",
 *    "purchase", "inventory") that had NEVER been seeded as
 *    ModuleDefinition/Permission rows at all — they only existed in the
 *    legacy Business.modules[].accessKeys system (see
 *    services/business.service.ts, api/admin/seed-modules/route.ts), which
 *    the Permission/RolePermission chain those routes actually check never
 *    reads. Combined with requirePermission() having no super-admin bypass
 *    (separately fixed in middleware/permission.guard.ts), this meant those
 *    routes 403'd for EVERY user, including super admins, no matter what
 *    role they held. The permission.guard.ts fix makes super admins work
 *    again unconditionally; these seed entries are what makes it POSSIBLE
 *    to grant this same access to any other role via the access matrix.
 *
 * Same mechanics as /api/admin/seed-crm-modules — see that route's top
 * comment for the full rationale (isSystem: true, businessId: null,
 * upsert-safe, syncPermissionsForModule generates the actual Permission
 * rows a role can be granted). Kept as a separate route rather than folded
 * into seed-crm-modules since this batch has nothing to do with CRM
 * specifically — naming the route honestly for what it does.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import ModuleDefinition from "@/core/module-registry/ModuleDefinition.model";
import { syncPermissionsForModule } from "@/core/access/permissionSync.service";

const ORPHANED_MODULES: Array<{
  key: string;
  label: string;
  pluralLabel: string;
  description: string;
  icon: string;
  route: string;
  applicableActions?: string[];
  sortOrder: number;
}> = [
  { key: "masters-units", label: "Unit", pluralLabel: "Units", description: "Measurement units used across products and materials.", icon: "Ruler", route: "/admin/masters/units", sortOrder: 60 },
  { key: "masters-brands", label: "Brand", pluralLabel: "Brands", description: "Product brand master list.", icon: "Tags", route: "/admin/masters/brands", sortOrder: 61 },
  { key: "masters-prod-cat", label: "Product Category", pluralLabel: "Product Categories", description: "Category tree for products.", icon: "Layers", route: "/admin/masters/product-categories", sortOrder: 62 },
  { key: "masters-mat-cat", label: "Material Category", pluralLabel: "Material Categories", description: "Category tree for raw materials.", icon: "Layers", route: "/admin/masters/material-categories", sortOrder: 63 },

  { key: "stock-transfers", label: "Stock Transfer", pluralLabel: "Stock Transfers", description: "Move stock between warehouses.", icon: "ArrowLeftRight", route: "/admin/stock-transfers", sortOrder: 70 },
  { key: "stock-adjustments", label: "Stock Adjustment", pluralLabel: "Stock Adjustments", description: "Manual stock corrections with reason codes.", icon: "SlidersHorizontal", route: "/admin/stock-adjustments", sortOrder: 71 },
  { key: "inventory-lots", label: "Inventory Lot", pluralLabel: "Inventory Lots", description: "Batch/lot-level inventory tracking.", icon: "Box", route: "/admin/inventory/lots", sortOrder: 72 },

  { key: "vendor-products", label: "Vendor Product", pluralLabel: "Vendor Products", description: "Vendor-submitted product approval queue.", icon: "ShoppingCart", route: "/admin/vendor-products", applicableActions: ["view", "approve"], sortOrder: 80 },

  { key: "analytics", label: "Analytics", pluralLabel: "Analytics", description: "Cross-business performance dashboard.", icon: "BarChart3", route: "/admin/analytics", applicableActions: ["view"], sortOrder: 211 },

  { key: "ai", label: "ANu Assistant", pluralLabel: "ANu Assistant", description: "In-house AI assistant chat.", icon: "Bot", route: "/admin/ai", applicableActions: ["view"], sortOrder: 220 },

  { key: "logistics", label: "Logistics", pluralLabel: "Logistics & Shipping", description: "Shipment tracking and delivery overview.", icon: "Truck", route: "/admin/logistics", applicableActions: ["view"], sortOrder: 230 },

  { key: "hr-documents", label: "HR Document", pluralLabel: "HR Documents", description: "Employee document vault with expiry tracking.", icon: "FolderOpen", route: "/admin/hr/documents", sortOrder: 240 },

  // NOTE: key is "settings" (not "admin-settings") — this MUST match
  // exactly, because app/api/invoice-templates/route.ts and [id]/route.ts
  // call requirePermission(session, buildPermissionCode("settings", ...)).
  // A mismatched key here would mean that permission code can never be
  // granted to any role, and (before the requirePermission super-admin
  // bypass fix in middleware/permission.guard.ts) would have 403'd even
  // super admins on those routes. The sidebar nav entry itself can still be
  // labeled/keyed "admin-settings" for its own display purposes — that's
  // a separate, cosmetic nav key, not the permission-check key.
  { key: "settings", label: "Setting", pluralLabel: "Settings", description: "Business-wide configuration hub.", icon: "Settings", route: "/admin/settings", applicableActions: ["view", "edit", "delete", "manage_settings"], sortOrder: 250 },
  { key: "admin-pincode-data", label: "Pincode Dataset", pluralLabel: "Pincode Data", description: "India pincode autofill dataset management.", icon: "MapPin", route: "/admin/pincode-data", applicableActions: ["view", "manage_settings"], sortOrder: 251 },

  // ── The following module keys are the REAL targets of live
  // requirePermission(buildPermissionCode(key, action)) calls scattered
  // across app/api/**/route.ts (gst/config, gst/filings, dashboard/overview,
  // organization/create, audit/logs, finance/invoices, finance/payments,
  // purchase/orders, inventory/items|movements|grn). None of these keys
  // had ANY ModuleDefinition/Permission row before this — they only existed
  // as legacy Business.modules[].accessKeys entries (see
  // services/business.service.ts's DEFAULT_MODULES and
  // api/admin/seed-modules/route.ts's NEW_MODULES), which the Permission/
  // RolePermission chain these routes actually check never reads. Before
  // the requirePermission super-admin bypass fix (middleware/
  // permission.guard.ts), this meant EVERY user including super admins
  // got a flat 403 on GST, Finance, Audit, Business-creation, Purchase,
  // Inventory, and Dashboard-overview routes. The bypass fix means super
  // admins now work regardless; these seed entries are what makes it
  // POSSIBLE to grant this access to any other role via the access matrix.
  { key: "gst", label: "GST Filing", pluralLabel: "GST", description: "GST configuration and filings.", icon: "FileText", route: "/admin/gst", applicableActions: ["view", "create", "edit", "approve"], sortOrder: 300 },
  { key: "dashboard", label: "Dashboard", pluralLabel: "Dashboard", description: "ERP metrics overview.", icon: "LayoutDashboard", route: "/admin", applicableActions: ["view"], sortOrder: 1 },
  { key: "businesses", label: "Business", pluralLabel: "Businesses", description: "Business/tenant records.", icon: "Building2", route: "/admin/business", applicableActions: ["view", "create", "edit", "delete"], sortOrder: 301 },
  { key: "audit", label: "Audit Log", pluralLabel: "Audit Logs", description: "System-wide create/update/delete activity trail.", icon: "ShieldCheck", route: "/admin/reports", applicableActions: ["view", "create"], sortOrder: 302 },
  { key: "finance", label: "Finance Record", pluralLabel: "Finance", description: "Invoices and payments.", icon: "DollarSign", route: "/admin/finance", applicableActions: ["view", "create", "edit"], sortOrder: 303 },
  { key: "purchase", label: "Purchase Order", pluralLabel: "Purchase", description: "Purchase orders.", icon: "ShoppingCart", route: "/admin/purchase", applicableActions: ["view", "create", "approve"], sortOrder: 304 },
  { key: "inventory", label: "Inventory Item", pluralLabel: "Inventory", description: "Inventory items, movements, and GRNs.", icon: "Package", route: "/admin/inventory", applicableActions: ["view", "edit"], sortOrder: 305 },
];

async function seedOrphanedModules(userId: string) {
  const results: { key: string; created: boolean; permissionsSynced: boolean }[] = [];

  for (const def of ORPHANED_MODULES) {
    let moduleDoc = await ModuleDefinition.findOne({ key: def.key, businessId: null });
    let created = false;

    if (!moduleDoc) {
      moduleDoc = await ModuleDefinition.create({
        key: def.key,
        label: def.label,
        pluralLabel: def.pluralLabel,
        description: def.description,
        icon: def.icon,
        route: def.route,
        isSystem: true,
        businessId: null,
        fields: [],
        applicableActions: def.applicableActions,
        sortOrder: def.sortOrder,
        enabled: true,
        createdBy: userId,
      });
      created = true;
    }

    await syncPermissionsForModule(moduleDoc);
    results.push({ key: def.key, created, permissionsSynced: true });
  }

  return results;
}

export async function POST() {
  const h = await headers();
  const isSuperAdmin = h.get("x-is-super-admin") === "true";
  const userId = h.get("x-user-id");

  if (!userId || !isSuperAdmin) {
    return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
  }

  await connectDB();
  const results = await seedOrphanedModules(userId);

  return NextResponse.json({
    success: true,
    message: "Previously-orphaned modules seeded",
    results,
  });
}

export async function GET() {
  const h = await headers();
  const isSuperAdmin = h.get("x-is-super-admin") === "true";
  const userId = h.get("x-user-id");

  if (!userId || !isSuperAdmin) {
    return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
  }

  await connectDB();
  const results = await seedOrphanedModules(userId);

  return NextResponse.json({
    success: true,
    message: "Previously-orphaned modules seeded",
    results,
  });
}
