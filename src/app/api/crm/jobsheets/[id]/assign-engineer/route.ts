/**
 * POST /api/crm/jobsheets/[id]/assign-engineer — CCO assigns a workorder to
 * an engineer. Milestone: CREATED -> REPAIR_STARTED.
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
    const { engineerId } = body;
    if (!engineerId || !mongoose.Types.ObjectId.isValid(engineerId)) {
      return NextResponse.json({ success: false, message: "engineerId is required" }, { status: 400 });
    }

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ _id: id, isDeleted: false });
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }
    if (jobSheet.status !== "CREATED") {
      return NextResponse.json(
        { success: false, message: `Cannot assign an engineer while status is ${jobSheet.status}.` },
        { status: 409 }
      );
    }

    jobSheet.assignedTo = new mongoose.Types.ObjectId(engineerId) as any;
    jobSheet.assignedBy = new mongoose.Types.ObjectId(userId) as any;
    jobSheet.engineerAssignedAt = new Date();
    jobSheet.status = "REPAIR_STARTED";
    await jobSheet.save();

    logAction({
      action: "ASSIGN_ENGINEER",
      entity: "CrmJobSheet",
      entityId: id,
      after: { assignedTo: engineerId, status: jobSheet.status },
      req,
      actor: { id: userId, businessId: jobSheet.businessId.toString() },
    });

    return NextResponse.json({ success: true, jobSheet });
  } catch (err: any) {
    console.error("CRM jobsheet assign-engineer error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
