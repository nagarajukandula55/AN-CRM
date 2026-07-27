import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import SsoSourceMapping from "@/models/SsoSourceMapping";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

function requireSuperAdmin(session: any) {
  if (!session?.isSuperAdmin) {
    throw Object.assign(new Error("Super Admin only"), { code: "FORBIDDEN" });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requireSuperAdmin(session);
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    for (const field of ["urlPattern", "sourceLabel", "defaultRoleCode", "isActive"]) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    await connectDB();
    const mapping = await SsoSourceMapping.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!mapping) {
      return NextResponse.json({ success: false, error: "Mapping not found" }, { status: 404 });
    }

    logAction({ action: "UPDATE", entity: "SsoSourceMapping", entityId: id, after: updates, req, actor: { id: session.user.id } });

    return NextResponse.json({ success: true, mapping });
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
      requireSuperAdmin(session);
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    await connectDB();
    const mapping = await SsoSourceMapping.findByIdAndDelete(id);
    if (!mapping) {
      return NextResponse.json({ success: false, error: "Mapping not found" }, { status: 404 });
    }

    logAction({ action: "DELETE", entity: "SsoSourceMapping", entityId: id, req, actor: { id: session.user.id } });

    return NextResponse.json({ success: true, message: "Mapping deleted" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
