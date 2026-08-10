import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Series from "@/models/Series";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

// SECURITY: PUT/DELETE below looked a series up by its Mongo _id ONLY --
// no check that its businessId belongs to the caller, so any
// authenticated user holding the generic device_models.edit/delete
// permission could edit or delete another business's series just by
// knowing/guessing its id.
async function assertOwnsSeries(series: { businessId: unknown } | null, userId: string, isSuperAdmin: boolean, sessionBusinessId: string | null) {
  if (!series) return false;
  if (isSuperAdmin) return true;
  const authorizedBusinessId = await resolveAuthorizedBusinessId(userId, String(series.businessId), isSuperAdmin, sessionBusinessId);
  return authorizedBusinessId === String(series.businessId);
}

// PUT /api/series/[id]
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("device_models", "edit"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid series id" }, { status: 400 });
    }

    const body = await req.json();
    const { name, isActive, businessScope, businessIds } = body;

    await connectDB();

    const existingSeries = await Series.findById(id).lean();
    if (!existingSeries || !(await assertOwnsSeries(existingSeries as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (isActive !== undefined) updates.isActive = isActive;
    if (businessScope !== undefined) updates.businessScope = businessScope;
    if (businessIds !== undefined) updates.businessIds = businessIds;

    const series = await Series.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "Series",
      entityId: id,
      after: updates,
      req,
    });

    return NextResponse.json({ success: true, series });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json({ success: false, error: "A series with this name already exists for this brand" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/series/[id]
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("device_models", "delete"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid series id" }, { status: 400 });
    }

    await connectDB();

    const existingSeries = await Series.findById(id).lean();
    if (!existingSeries || !(await assertOwnsSeries(existingSeries as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    const series = await Series.findByIdAndDelete(id).lean();

    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    logAction({
      action: "DELETE",
      entity: "Series",
      entityId: id,
      req: _req,
    });

    return NextResponse.json({ success: true, message: "Series deleted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
