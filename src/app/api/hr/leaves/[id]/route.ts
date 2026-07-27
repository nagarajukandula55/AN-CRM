import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import LeaveRequest from "@/models/LeaveRequest";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

const VALID_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

export async function PATCH(req: NextRequest, context: any) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("hr_leaves", "edit"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const id = context?.params?.id;
    const body = await req.json();
    const { status } = body;

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, message: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const leave = await LeaveRequest.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
    if (!leave) {
      return NextResponse.json({ success: false, message: "Leave request not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "LeaveRequest",
      entityId: id,
      after: { status },
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, leave });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update leave request" },
      { status: 500 }
    );
  }
}
