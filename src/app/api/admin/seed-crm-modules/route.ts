/**
 * POST/GET /api/admin/seed-crm-modules
 *
 * Seeds the CRM lifecycle AND the new Reports & Downloads screen as proper
 * SYSTEM ModuleDefinition rows (isSystem: true, businessId: null) — the
 * registry that actually drives both the sidebar (via
 * filterModulesByPermission + /api/ui/sidebar) and the access matrix (via
 * accessMatrix.service.ts). Kept in one route/file (rather than a
 * separately-named "seed-reports-module" route) since both were added in
 * the same pass and share the exact same seeding mechanics — route name is
 * CRM-specific for historical reasons but covers "crm", "crm_calls",
 * "crm_jobsheets", and "reports". Until this route is run once, none of
 * these have Permission rows at all, so no role (including ones a super
 * admin creates) can ever be granted access to them — this is the same
 * class of gap the codebase's own comments describe for other modules
 * ("built but never wired up").
 *
 * Safe to run multiple times: creates each ModuleDefinition only if it
 * doesn't already exist (by key + businessId: null), then always re-runs
 * syncPermissionsForModule so permission rows stay current even if this
 * route is redeployed with different applicableActions later.
 *
 * There was no existing seed path for *system* modules at all — only
 * createModuleDefinition() for business-scoped custom modules — so this
 * writes ModuleDefinition documents directly rather than going through
 * that business-scoped helper.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import ModuleDefinition from "@/core/module-registry/ModuleDefinition.model";
import { syncPermissionsForModule } from "@/core/access/permissionSync.service";

const CRM_SYSTEM_MODULES = [
  {
    key: "crm",
    label: "CRM Overview",
    pluralLabel: "CRM Overview",
    description: "CRM summary dashboard — leads, calls, and job sheets at a glance.",
    icon: "UserPlus",
    route: "/admin/crm",
    // Read-only landing page — no create/edit/delete/approve action makes
    // sense for a dashboard, so this module only ever needs VIEW. Without
    // applicableActions restricted here, syncPermissionsForModule would
    // generate all 7 STANDARD_ACTIONS (CRM.CREATE, CRM.DELETE, etc.) that
    // could never correspond to anything a role could meaningfully do.
    applicableActions: ["view"],
    sortOrder: 199,
  },
  {
    key: "crm_calls",
    label: "Appointment",
    pluralLabel: "Appointments",
    description: "Appointment entry, disposition tracking, and follow-up pipeline.",
    icon: "PhoneCall",
    route: "/admin/crm/calls",
    sortOrder: 200,
  },
  {
    key: "crm_jobsheets",
    label: "Workorder",
    pluralLabel: "Workorders",
    description: "Work performed for a customer, from scheduling through invoicing.",
    icon: "ClipboardList",
    route: "/admin/crm/jobsheets",
    sortOrder: 201,
  },
  {
    key: "reports",
    label: "Report",
    pluralLabel: "Reports & Downloads",
    description: "Cross-module reports (CRM, sales, inventory, finance) with downloadable exports.",
    icon: "BarChart3",
    route: "/admin/reports",
    // Reports are read/export only — same reasoning as the "crm" overview
    // module above (no create/edit/delete/approve action applies to a
    // report-viewing screen).
    applicableActions: ["view", "export"],
    sortOrder: 210,
  },
];

async function seedCrmModules(userId: string) {
  const results: { key: string; created: boolean; permissionsSynced: boolean }[] = [];

  for (const def of CRM_SYSTEM_MODULES as Array<(typeof CRM_SYSTEM_MODULES)[number] & { applicableActions?: string[] }>) {
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

    // Always re-sync so Permission rows exist / stay current, whether the
    // module doc was just created or already existed from a prior run.
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
  const results = await seedCrmModules(userId);

  return NextResponse.json({
    success: true,
    message: "CRM modules seeded",
    results,
  });
}

// GET — mirrors the existing seed-modules route's convenience GET handler
// for quick browser-based triggering during setup.
export async function GET() {
  const h = await headers();
  const isSuperAdmin = h.get("x-is-super-admin") === "true";
  const userId = h.get("x-user-id");

  if (!userId || !isSuperAdmin) {
    return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
  }

  await connectDB();
  const results = await seedCrmModules(userId);

  return NextResponse.json({
    success: true,
    message: "CRM modules seeded",
    results,
  });
}
