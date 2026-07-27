import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/core/db/mongodb";
import {
  createModuleDefinition,
  listModulesForBusiness,
} from "@/core/module-registry/moduleDefinition.service";
import { logAction } from "@/lib/audit/logAction";

// GET /api/modules?businessId=... — list every module (system + this
// business's custom ones) for nav/UI rendering. This is what should drive
// the sidebar going forward, replacing the hardcoded route list.
export async function GET(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    await connectDB();
    const modules = await listModulesForBusiness(businessId);

    return NextResponse.json({ success: true, modules });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/modules — admin creates a new custom module. This is the actual
// "invent a module from the UI" entry point (Option A). Should be gated by
// a permission check (e.g. "platform.manage_modules") once the permission
// is seeded — see PROGRESS.md for what's still pending on that front.
export async function POST(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Restricted to super admins for now — same reasoning as the PUT/DELETE
    // handlers in [key]/route.ts: no dedicated "platform.manage_modules"
    // permission is seeded yet, so isSuperAdmin is the safe gate until one is.
    const isSuperAdmin = h.get("x-is-super-admin") === "true";
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Only Super Admins can create module definitions" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { key, label, pluralLabel, description, icon, route, businessId, fields } = body;

    if (!key || !label || !pluralLabel || !route || !businessId) {
      return NextResponse.json(
        { error: "key, label, pluralLabel, route, and businessId are required" },
        { status: 400 }
      );
    }

    await connectDB();
    const moduleDef = await createModuleDefinition({
      key,
      label,
      pluralLabel,
      description,
      icon,
      route,
      businessId,
      fields: fields ?? [],
      createdBy: userId,
    });

    logAction({
      action: "CREATE",
      entity: "ModuleDefinition",
      entityId: moduleDef?._id?.toString(),
      after: moduleDef,
      req,
      actor: { businessId },
    });

    return NextResponse.json({ success: true, module: moduleDef }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
