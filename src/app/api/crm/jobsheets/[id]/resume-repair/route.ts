/**
 * POST /api/crm/jobsheets/[id]/resume-repair — the part arrived, resume
 * work. PART_PENDING -> REPAIR_IN_PROGRESS.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { requireAssignedEngineer } from "@/core/access/crmJobsheetAccess";

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

    await connectDB();

    const jobSheet = await CrmJobSheet.findOne({ _id: id, isDeleted: false });
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }
    const accessError = requireAssignedEngineer(jobSheet, userId, !!session.isSuperAdmin);
    if (accessError) return accessError;
    if (jobSheet.status !== "PART_PENDING") {
      return NextResponse.json(
        { success: false, message: `Cannot resume repair while status is ${jobSheet.status}.` },
        { status: 409 }
      );
    }

    jobSheet.status = "REPAIR_IN_PROGRESS";
    await jobSheet.save();

    logAction({
      action: "RESUME_REPAIR",
      entity: "CrmJobSheet",
      entityId: id,
      after: { status: jobSheet.status },
      req,
      actor: { id: userId, businessId: jobSheet.businessId.toString() },
    });

    return NextResponse.json({ success: true, jobSheet });
  } catch (err: any) {
    console.error("CRM jobsheet resume-repair error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
