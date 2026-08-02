/**
 * GET /api/vendor-modules — the full list of vendor-operational module
 * keys + labels (VENDOR_MODULE_KEYS intersected against the module
 * hierarchy), used to render the "Vendor Type Module Access" checklists
 * on the business settings page (console/business/[id]). Admin-auth-gated
 * the same way as PATCH /api/businesses/[id] (BUSINESSES.EDIT) since this
 * only feeds an admin-only config surface.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { VENDOR_MODULE_KEYS } from "@/core/access/vendorAccess.service";
import { ACCESS_HIERARCHY, ModuleEntry } from "@/core/access/moduleHierarchy";

function flattenHierarchy(): ModuleEntry[] {
  const out: ModuleEntry[] = [];
  for (const cat of ACCESS_HIERARCHY) {
    for (const m of cat.modules ?? []) out.push(m);
    for (const sc of cat.subcategories ?? []) out.push(...sc.modules);
  }
  return out;
}

export async function GET() {
  try {
    await connectDB();

    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("businesses", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    const vendorKeys = new Set<string>(VENDOR_MODULE_KEYS);
    const modules = flattenHierarchy()
      .filter((m) => vendorKeys.has(m.key))
      .map((m) => ({ key: m.key, label: m.label }));

    return NextResponse.json({ success: true, modules });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
