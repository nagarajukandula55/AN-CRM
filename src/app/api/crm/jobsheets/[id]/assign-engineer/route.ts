/**
 * POST /api/crm/jobsheets/[id]/assign-engineer — CCO assigns a workorder to
 * an engineer. Milestone: CREATED -> REPAIR_STARTED.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import User from "@/models/User";
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
      // SC (single-login, no separate Engineer role) self-assigns to
      // start repair -- see _JobSheetForm.tsx's proceedForRepair(), which
      // calls this then immediately calls start-repair. A double-click or
      // slow-network retry before the UI re-renders the new status would
      // otherwise hard-error here even though the job is already
      // correctly assigned to the SAME person -- nothing unsafe about
      // that specific retry, unlike actually reassigning to a DIFFERENT
      // engineer mid-repair, which still correctly blocks below.
      if (String(jobSheet.assignedTo || "") === String(engineerId)) {
        return NextResponse.json({ success: true, jobSheet });
      }
      return NextResponse.json(
        { success: false, message: `Cannot assign an engineer while status is ${jobSheet.status}.` },
        { status: 409 }
      );
    }

    const engineer = await User.findById(engineerId).select("name").lean<any>();

    jobSheet.assignedTo = new mongoose.Types.ObjectId(engineerId) as any;
    // Engineer name snapshot -- see CrmJobSheet.ts's field comment.
    jobSheet.assignedToName = engineer?.name || "";
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
