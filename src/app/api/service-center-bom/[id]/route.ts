import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import ServiceCenterBOM from "@/models/ServiceCenterBOM";
import DeviceModel from "@/models/DeviceModel";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";
import { resolveOwnerOrManagerVendor } from "@/core/access/vendorAccess.service";

async function resolveVendor(userId: string) {
  return resolveOwnerOrManagerVendor(userId);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    await connectDB();
    const vendor = await resolveVendor(session.user.id);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "No vendor profile found for this account" }, { status: 403 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    for (const field of ["partName", "hsnCode", "rate", "isActive", "brandId", "deviceModelId", "description", "partType", "unit", "gstRate", "warrantyDays", "materialId"]) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // Keep seriesId in sync whenever deviceModelId changes (including being
    // cleared) -- see the seriesId field comment on ServiceCenterBOM.
    if (updates.deviceModelId !== undefined) {
      if (updates.deviceModelId && mongoose.Types.ObjectId.isValid(updates.deviceModelId as string)) {
        const modelDoc = await DeviceModel.findById(updates.deviceModelId).select("seriesId").lean<any>();
        updates.seriesId = modelDoc?.seriesId || null;
      } else {
        updates.seriesId = null;
      }
    }

    const part = await ServiceCenterBOM.findOneAndUpdate(
      { _id: id, businessId: (vendor as any).businessId, vendorId: (vendor as any)._id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!part) {
      return NextResponse.json({ success: false, error: "Part not found" }, { status: 404 });
    }

    logAction({ action: "UPDATE", entity: "ServiceCenterBOM", entityId: id, after: updates, req });

    return NextResponse.json({ success: true, part });
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
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    await connectDB();
    const vendor = await resolveVendor(session.user.id);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "No vendor profile found for this account" }, { status: 403 });
    }

    const part = await ServiceCenterBOM.findOneAndUpdate(
      { _id: id, businessId: (vendor as any).businessId, vendorId: (vendor as any)._id },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!part) {
      return NextResponse.json({ success: false, error: "Part not found" }, { status: 404 });
    }

    logAction({ action: "DELETE", entity: "ServiceCenterBOM", entityId: id, req });

    return NextResponse.json({ success: true, message: "Part deactivated" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
