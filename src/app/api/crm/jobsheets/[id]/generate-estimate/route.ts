/**
 * POST /api/crm/jobsheets/[id]/generate-estimate — explicit "Generate
 * Estimate" action. Per direction, estimates must not be printable for
 * every workorder by default: staff must add Parts & Service line items
 * first, then deliberately click Generate Estimate, and only then does
 * "Print Estimate" become available (see CrmJobSheet.estimateGenerated).
 * Idempotent -- calling again just refreshes estimateGeneratedAt.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
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

    const { id } = await params;
    await connectDB();

    const jobSheet = await CrmJobSheet.findById(id);
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }

    const hasLineItems = Array.isArray(jobSheet.lineItems) && jobSheet.lineItems.some((li: any) => (li.description || "").trim());
    if (!hasLineItems) {
      return NextResponse.json(
        { success: false, message: "Add at least one Parts & Service line item before generating an estimate." },
        { status: 400 }
      );
    }

    jobSheet.estimateGenerated = true;
    jobSheet.estimateGeneratedAt = new Date();
    await jobSheet.save();

    return NextResponse.json({ success: true, estimateGeneratedAt: jobSheet.estimateGeneratedAt });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || "Failed to generate estimate" }, { status: 500 });
  }
}
