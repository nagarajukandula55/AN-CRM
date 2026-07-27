import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/core/db/mongodb";
import {
  updateModuleDefinition,
  deleteModuleDefinition,
  getModuleDefinition,
} from "@/core/module-registry/moduleDefinition.service";
import { logAction } from "@/lib/audit/logAction";

/**
 * PUT/DELETE /api/modules/:key — edit or remove a business's own custom
 * module definition (system modules can never be touched here — enforced
 * both by updateModuleDefinition/deleteModuleDefinition's own query filters
 * and by the isSuperAdmin gate below).
 *
 * Restricted to super admins for now: this is a brand-new capability with
 * no seeded Permission rows of its own yet (unlike the rest of the access
 * system, which resolves permission codes via
 * core/access/actions.ts's buildPermissionCode()) — gating on the
 * super-admin header is the safe default until a dedicated
 * "platform.manage_modules" permission is seeded and wired through
 * syncPermissionsForModule().
 */

async function requireSuperAdmin() {
  const h = await headers();
  const userId = h.get("x-user-id");
  const isSuperAdmin = h.get("x-is-super-admin") === "true";
  if (!userId) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (!isSuperAdmin) return { ok: false as const, status: 403, error: "Only Super Admins can manage module definitions" };
  return { ok: true as const };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { key } = await params;
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    await connectDB();
    const moduleDef = await getModuleDefinition(key, businessId);

    if (!moduleDef) {
      return NextResponse.json({ success: false, error: "Module not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, module: moduleDef });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const guard = await requireSuperAdmin();
    if (!guard.ok) {
      return NextResponse.json({ success: false, error: guard.error }, { status: guard.status });
    }

    const { key } = await params;
    const body = await req.json();
    const { businessId, ...updates } = body;

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    await connectDB();
    const before = await getModuleDefinition(key, businessId);
    const updated = await updateModuleDefinition(key, businessId, updates);

    logAction({
      action: "UPDATE",
      entity: "ModuleDefinition",
      entityId: updated?._id?.toString(),
      before,
      after: updated,
      req,
      actor: { businessId },
    });

    return NextResponse.json({ success: true, module: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const guard = await requireSuperAdmin();
    if (!guard.ok) {
      return NextResponse.json({ success: false, error: guard.error }, { status: guard.status });
    }

    const { key } = await params;
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    await connectDB();
    const before = await getModuleDefinition(key, businessId);
    await deleteModuleDefinition(key, businessId);

    logAction({
      action: "DELETE",
      entity: "ModuleDefinition",
      entityId: key,
      before,
      req,
      actor: { businessId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
