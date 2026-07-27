import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import SymptomCode from "@/models/SymptomCode";
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("fault_codes", "edit"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    for (const field of ["code", "description", "category", "deviceCategory", "isActive", "businessScope", "businessIds", "parentId"]) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    await connectDB();
    const symptomCode = await SymptomCode.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!symptomCode) {
      return NextResponse.json({ success: false, error: "Symptom code not found" }, { status: 404 });
    }

    logAction({ action: "UPDATE", entity: "SymptomCode", entityId: id, after: updates, req });

    return NextResponse.json({ success: true, symptomCode });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("fault_codes", "delete"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    await connectDB();
    const symptomCode = await SymptomCode.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
    if (!symptomCode) {
      return NextResponse.json({ success: false, error: "Symptom code not found" }, { status: 404 });
    }

    logAction({ action: "DELETE", entity: "SymptomCode", entityId: id, req });

    return NextResponse.json({ success: true, message: "Symptom code deactivated" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
