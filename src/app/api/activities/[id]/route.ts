import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import Activity from "@/models/Activity";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

// PUT /api/activities/[id] -- toggle completed, edit description/dueDate.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("deals", "edit"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    for (const field of ["description", "dueDate"]) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    if (body.completed !== undefined) {
      updates.completed = !!body.completed;
      updates.completedAt = body.completed ? new Date() : null;
    }

    await connectDB();
    const activity = await Activity.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!activity) {
      return NextResponse.json({ success: false, error: "Activity not found" }, { status: 404 });
    }

    logAction({ action: "UPDATE", entity: "Activity", entityId: id, after: updates, req, actor: { id: session.user.id } });

    return NextResponse.json({ success: true, activity });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/activities/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("deals", "edit"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    await connectDB();
    const activity = await Activity.findByIdAndDelete(id);
    if (!activity) {
      return NextResponse.json({ success: false, error: "Activity not found" }, { status: 404 });
    }

    logAction({ action: "DELETE", entity: "Activity", entityId: id, req, actor: { id: session.user.id } });

    return NextResponse.json({ success: true, message: "Activity deleted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
