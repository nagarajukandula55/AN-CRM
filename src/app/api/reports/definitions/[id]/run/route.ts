/**
 * GET /api/reports/definitions/[id]/run — execute a saved report and
 * return its rows (+ chart data when applicable). Read-only, no side
 * effects -- separate from the scheduled/emailed run (see
 * api/cron/run-scheduled-reports).
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import ReportDefinition from "@/models/ReportDefinition";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { runReport } from "@/core/reports/runReport";
import { resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
    }

    const scope = await resolveAuthorizedVendorScope(
      session.user.id,
      req.nextUrl.searchParams.get("businessId"),
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    if (!scope?.businessId) {
      return NextResponse.json({ success: false, message: "No active business" }, { status: 400 });
    }

    await connectDB();
    const ownershipFilter: Record<string, unknown> = { _id: id, businessId: scope.businessId };
    if (scope.vendorId) ownershipFilter.$or = [{ vendorId: scope.vendorId }, { vendorId: null }];
    const report = await ReportDefinition.findOne(ownershipFilter).lean();
    if (!report) {
      return NextResponse.json({ success: false, message: "Report not found" }, { status: 404 });
    }

    const result = await runReport(report as any, scope.vendorId);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
