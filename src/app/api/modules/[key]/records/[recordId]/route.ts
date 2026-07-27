import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/core/db/mongodb";
import {
  updateModuleRecord,
  softDeleteModuleRecord,
  ModuleRecordValidationError,
} from "@/core/module-registry/moduleRecord.service";
import { logAction } from "@/lib/audit/logAction";

// PATCH /api/modules/:key/records/:recordId
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string; recordId: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { recordId } = await params;
    const body = await req.json();
    const { businessId, data } = body;

    if (!businessId || !data) {
      return NextResponse.json(
        { error: "businessId and data are required" },
        { status: 400 }
      );
    }

    await connectDB();
    const record = await updateModuleRecord(recordId, businessId, data, userId);

    logAction({
      action: "UPDATE",
      entity: "ModuleRecord",
      entityId: recordId,
      after: data,
      req,
      actor: { businessId },
    });

    return NextResponse.json({ success: true, record });
  } catch (error: unknown) {
    if (error instanceof ModuleRecordValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, fieldErrors: error.errors },
        { status: 422 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

// DELETE /api/modules/:key/records/:recordId?businessId=...
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string; recordId: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { recordId } = await params;
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    await connectDB();
    await softDeleteModuleRecord(recordId, businessId);

    logAction({
      action: "DELETE",
      entity: "ModuleRecord",
      entityId: recordId,
      req,
      actor: { businessId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
