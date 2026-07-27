import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Payroll from "@/models/Payroll";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";

export async function PATCH(req: NextRequest, context: any) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("hr_payroll", "edit"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const id = context?.params?.id;

    const payroll = await Payroll.findByIdAndUpdate(
      id,
      { $set: { status: "PAID", paidAt: new Date() } },
      { new: true }
    ).lean();
    if (!payroll) {
      return NextResponse.json({ success: false, message: "Payroll record not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "Payroll",
      entityId: id,
      after: { status: "PAID" },
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, payroll });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to mark payroll as paid" },
      { status: 500 }
    );
  }
}
