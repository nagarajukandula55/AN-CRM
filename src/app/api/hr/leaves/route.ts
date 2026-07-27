/**
 * HR Leave Requests API — backs src/app/admin/hr/leave/page.tsx.
 * GET  /api/hr/leaves?businessId=
 * POST /api/hr/leaves
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import LeaveRequest from "@/models/LeaveRequest";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";
import { notifyUser } from "@/services/notification.service";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("hr_leaves", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const leaves = await LeaveRequest.find({ businessId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, leaves });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load leave requests" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("hr_leaves", "create"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const body = await req.json();
    const { businessId, employeeName, leaveType, fromDate, toDate, reason } = body;

    if (!businessId || !employeeName || !fromDate || !toDate) {
      return NextResponse.json(
        { success: false, message: "businessId, employeeName, fromDate and toDate are required" },
        { status: 400 }
      );
    }

    const leave = await LeaveRequest.create({
      businessId,
      employeeName,
      leaveType: leaveType || "Annual Leave",
      fromDate: new Date(fromDate),
      toDate: new Date(toDate),
      reason,
    });

    logAction({
      action: "CREATE",
      entity: "LeaveRequest",
      entityId: leave._id?.toString(),
      after: leave,
      req,
      actor: { id: session.user.id, businessId },
    });

    notifyUser({
      userId: session.user.id,
      businessId,
      title: "Leave request submitted",
      message: `${employeeName}'s ${leave.leaveType} request (${leave.days} day${leave.days > 1 ? "s" : ""}) is pending approval.`,
      type: "info",
      link: "/admin/hr/leave",
    });

    return NextResponse.json({ success: true, leave }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to submit leave request" },
      { status: 500 }
    );
  }
}
