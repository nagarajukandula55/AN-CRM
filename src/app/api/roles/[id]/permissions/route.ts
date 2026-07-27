/**
 * Role permissions API — backs the "Assign Permissions" screen at
 * src/app/(admin)/roles/[id]/page.tsx, which previously called these
 * routes with no matching backend at all.
 *
 * Role.permissions stores an array of Permission *codes* (not ids), but
 * the frontend's permission matrix works in Permission._id (matching what
 * GET /api/permissions returns as each entry's `id`) -- these routes
 * translate between the two so neither side has to change its shape.
 *
 * GET  /api/roles/[id]/permissions  -> { data: string[] }  (Permission _ids currently granted)
 * POST /api/roles/[id]/permissions  <- { permissionIds: string[] } -> replaces the role's grants
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Role from "@/models/Role";
import Permission from "@/models/Permission";
import { auth } from "@/lib/auth/auth";
import { logAction } from "@/lib/audit/logAction";

export async function GET(req: NextRequest, context: any) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await context.params;

    const role = await Role.findById(id).lean();
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    const codes = (role as any).permissions || [];
    const grantedPerms = codes.length
      ? await Permission.find({ code: { $in: codes } }).select("_id").lean()
      : [];

    return NextResponse.json({
      success: true,
      data: grantedPerms.map((p: any) => p._id.toString()),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load role permissions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: any) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await context.params;
    const body = await req.json();
    const permissionIds: string[] = Array.isArray(body?.permissionIds) ? body.permissionIds : [];

    const perms = permissionIds.length
      ? await Permission.find({ _id: { $in: permissionIds } }).select("code").lean()
      : [];
    const codes = perms.map((p: any) => p.code);

    const role = await Role.findByIdAndUpdate(id, { $set: { permissions: codes } }, { new: true }).lean();
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "Role",
      entityId: id,
      after: { permissions: codes },
      req,
    });

    return NextResponse.json({ success: true, data: codes });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update role permissions" },
      { status: 500 }
    );
  }
}
