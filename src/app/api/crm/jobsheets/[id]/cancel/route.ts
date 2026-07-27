/**
 * POST /api/crm/jobsheets/[id]/cancel — vendor staff request to cancel a
 * workorder before it's handed over. Routed to the vendor's Manager per
 * spec ("access to Cancel to manager"); this endpoint just records the
 * request and moves the job to CANCELLED — manager approval workflow is a
 * later phase, this is the mechanical status transition it depends on.
 * Not allowed once the job is already CLOSED.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }
    const userId = session.user.id;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid job sheet id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { cancelReason } = body;
    if (!cancelReason?.trim()) {
      return NextResponse.json({ success: false, message: "cancelReason is required" }, { status: 400 });
    }

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ _id: id, isDeleted: false });
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }
    if (jobSheet.status === "CLOSED" || jobSheet.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, message: `Cannot cancel a job sheet that is already ${jobSheet.status}.` },
        { status: 409 }
      );
    }

    jobSheet.cancelReason = cancelReason.trim();
    jobSheet.cancelRequestedBy = new mongoose.Types.ObjectId(userId) as any;
    jobSheet.cancelledAt = new Date();
    jobSheet.status = "CANCELLED";
    await jobSheet.save();

    logAction({
      action: "CANCEL",
      entity: "CrmJobSheet",
      entityId: id,
      after: { status: jobSheet.status, cancelReason: jobSheet.cancelReason },
      req,
      actor: { id: userId, businessId: jobSheet.businessId.toString() },
    });

    return NextResponse.json({ success: true, jobSheet });
  } catch (err: any) {
    console.error("CRM jobsheet cancel error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
