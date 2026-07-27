import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import CrmOptionList from "@/models/CrmOptionList";
import { logAction } from "@/lib/audit/logAction";

async function requireSuperAdmin() {
  const h = await headers();
  return h.get("x-user-id") && h.get("x-is-super-admin") === "true";
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireSuperAdmin())) {
      return NextResponse.json({ success: false, error: "Super Admin access required" }, { status: 403 });
    }
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const { label, code, sortOrder, isActive } = body;

    await connectDB();
    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = label.trim();
    if (code !== undefined) updates.code = code.trim();
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (isActive !== undefined) updates.isActive = isActive;

    const option = await CrmOptionList.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
    if (!option) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    logAction({ action: "UPDATE", entity: "CrmOptionList", entityId: id, after: updates, req });
    return NextResponse.json({ success: true, option });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireSuperAdmin())) {
      return NextResponse.json({ success: false, error: "Super Admin access required" }, { status: 403 });
    }
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    await connectDB();
    const option = await CrmOptionList.findByIdAndDelete(id).lean();
    if (!option) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    logAction({ action: "DELETE", entity: "CrmOptionList", entityId: id, req });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
