/**
 * POST /api/crm/jobsheets/[id]/claim — lets the vendor who owns this job
 * sheet reclaim it after a Super Admin (overseeing on their behalf, see
 * _JobSheetForm.tsx) started the repair themselves. Does not change
 * `status` -- the vendor just takes over `assignedTo` and continues the
 * repair from wherever the admin left it. See assign-engineer/route.ts,
 * which stamps `startedBySuperAdmin` in the first place.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";

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
    // Claim is for the original vendor taking back their own job sheet --
    // a Super Admin has no "own vendor" to claim on behalf of, and is the
    // party a claim is meant to hand the job back FROM.
    if ((session as any).isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super Admins cannot claim a job sheet." }, { status: 403 });
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

    const scope = await resolveAuthorizedVendorScope(
      userId,
      jobSheet.businessId?.toString(),
      false,
      (session as any).business?.businessId
    );
    if (!scope || !scope.vendorId || String(scope.vendorId) !== String(jobSheet.vendorId || "")) {
      return NextResponse.json(
        { success: false, message: "Only the vendor that logged this call can claim it." },
        { status: 403 }
      );
    }

    if (!(jobSheet as any).startedBySuperAdmin) {
      return NextResponse.json(
        { success: false, message: "This job sheet was not started by a Super Admin -- nothing to claim." },
        { status: 409 }
      );
    }
    if (!["REPAIR_STARTED", "REPAIR_IN_PROGRESS", "PART_PENDING"].includes(jobSheet.status)) {
      return NextResponse.json(
        { success: false, message: `Cannot claim while status is ${jobSheet.status}.` },
        { status: 409 }
      );
    }

    jobSheet.assignedTo = new mongoose.Types.ObjectId(userId) as any;
    jobSheet.assignedToName = session.user.name || "";
    jobSheet.assignedBy = new mongoose.Types.ObjectId(userId) as any;
    (jobSheet as any).startedBySuperAdmin = false;
    (jobSheet as any).claimedBy = new mongoose.Types.ObjectId(userId);
    (jobSheet as any).claimedByName = session.user.name || "";
    (jobSheet as any).claimedAt = new Date();
    await jobSheet.save();

    logAction({
      action: "CLAIM",
      entity: "CrmJobSheet",
      entityId: id,
      after: { assignedTo: userId, status: jobSheet.status },
      req,
      actor: { id: userId, businessId: jobSheet.businessId.toString() },
    });

    return NextResponse.json({ success: true, jobSheet });
  } catch (err: any) {
    console.error("CRM jobsheet claim error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
