import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import HsnTaxRate from "@/models/HsnTaxRate";
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
      requirePermission(session as any, buildPermissionCode("gst", "manage_settings"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const existing = await HsnTaxRate.findById(id);
    if (existing && existing.businessId === null) {
      return NextResponse.json(
        { success: false, error: "Global/default HSN rates cannot be edited, only business-specific overrides" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    for (const field of ["hsnCode", "gstRate", "category", "description"]) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    await connectDB();
    const rate = await HsnTaxRate.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!rate) {
      return NextResponse.json({ success: false, error: "HSN rate not found" }, { status: 404 });
    }

    logAction({ action: "UPDATE", entity: "HsnTaxRate", entityId: id, after: updates, req });

    return NextResponse.json({ success: true, rate });
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
      requirePermission(session as any, buildPermissionCode("gst", "manage_settings"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    await connectDB();
    const existing = await HsnTaxRate.findById(id);
    if (existing && existing.businessId === null) {
      return NextResponse.json(
        { success: false, error: "Global/default HSN rates cannot be deleted" },
        { status: 403 }
      );
    }

    const rate = await HsnTaxRate.findByIdAndDelete(id);
    if (!rate) {
      return NextResponse.json({ success: false, error: "HSN rate not found" }, { status: 404 });
    }

    logAction({ action: "DELETE", entity: "HsnTaxRate", entityId: id, req });

    return NextResponse.json({ success: true, message: "HSN rate deleted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
