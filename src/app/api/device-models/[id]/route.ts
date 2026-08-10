import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import DeviceModel from "@/models/DeviceModel";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

// SECURITY: PUT/DELETE below looked a model up by its Mongo _id ONLY -- no
// check that its businessId belongs to the caller, so any authenticated
// user holding the generic device_models.edit/delete permission could
// edit or delete another business's device model just by knowing/
// guessing its id.
async function assertOwnsModel(model: { businessId: unknown } | null, userId: string, isSuperAdmin: boolean, sessionBusinessId: string | null) {
  if (!model) return false;
  if (isSuperAdmin) return true;
  const authorizedBusinessId = await resolveAuthorizedBusinessId(userId, String(model.businessId), isSuperAdmin, sessionBusinessId);
  return authorizedBusinessId === String(model.businessId);
}

// PUT /api/device-models/[id]
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
      return NextResponse.json({ error: "Invalid model id" }, { status: 400 });
    }

    const body = await req.json();
    const { name, brandId, seriesId, isActive, businessScope, businessIds } = body;

    if (seriesId !== undefined && seriesId !== null && !Types.ObjectId.isValid(seriesId)) {
      return NextResponse.json({ error: "Invalid seriesId" }, { status: 400 });
    }

    await connectDB();

    const existingModel = await DeviceModel.findById(id).lean();
    if (!existingModel || !(await assertOwnsModel(existingModel as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (brandId !== undefined && Types.ObjectId.isValid(brandId)) updates.brandId = brandId;
    // seriesId: omit to leave unchanged, pass null to move to "no series"
    // (direct under brand), pass a valid ObjectId to move to another series.
    if (seriesId !== undefined) {
      updates.seriesId = seriesId === null ? null : new Types.ObjectId(seriesId);
    }
    if (isActive !== undefined) updates.isActive = isActive;
    if (businessScope !== undefined) updates.businessScope = businessScope;
    if (businessIds !== undefined) updates.businessIds = businessIds;

    const model = await DeviceModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    logAction({ action: "UPDATE", entity: "DeviceModel", entityId: id, after: updates, req });

    return NextResponse.json({ success: true, model });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json({ success: false, error: "This model already exists for this brand" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/device-models/[id]
export async function DELETE(
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
      requirePermission(session as any, buildPermissionCode("device_models", "delete"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid model id" }, { status: 400 });
    }

    await connectDB();

    const existingModel = await DeviceModel.findById(id).lean();
    if (!existingModel || !(await assertOwnsModel(existingModel as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const model = await DeviceModel.findByIdAndDelete(id).lean();
    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    logAction({ action: "DELETE", entity: "DeviceModel", entityId: id, req });

    return NextResponse.json({ success: true, message: "Model deleted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
