import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose, { Types } from "mongoose";
import Activity, { ACTIVITY_TYPES } from "@/models/Activity";
import Deal from "@/models/Deal";
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

// GET /api/deals/[id]/activities
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("deals", "view"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid deal id" }, { status: 400 });
    }

    await connectDB();
    const activities = await Activity.find({ dealId: id }).sort({ createdAt: -1 }).lean();

    return NextResponse.json({ success: true, activities });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/deals/[id]/activities
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      return NextResponse.json({ success: false, error: "Invalid deal id" }, { status: 400 });
    }

    await connectDB();
    const deal = await Deal.findById(id).select("businessId").lean();
    if (!deal) {
      return NextResponse.json({ success: false, error: "Deal not found" }, { status: 404 });
    }

    const body = await req.json();
    const { type, description, dueDate } = body;
    if (!description?.trim()) {
      return NextResponse.json({ success: false, error: "description is required" }, { status: 400 });
    }

    const activity = await Activity.create({
      businessId: (deal as any).businessId ?? null,
      dealId: new Types.ObjectId(id),
      type: (ACTIVITY_TYPES as readonly string[]).includes(type) ? type : "NOTE",
      description: description.trim(),
      dueDate: dueDate ? new Date(dueDate) : null,
      createdBy: session.user.id && Types.ObjectId.isValid(session.user.id) ? new Types.ObjectId(session.user.id) : null,
    });

    logAction({
      action: "CREATE",
      entity: "Activity",
      entityId: activity?._id?.toString(),
      after: body,
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, activity }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
