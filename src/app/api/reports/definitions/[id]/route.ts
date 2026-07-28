/**
 * PATCH /api/reports/definitions/[id] — edit a saved report.
 * DELETE /api/reports/definitions/[id] — remove it.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import ReportDefinition from "@/models/ReportDefinition";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { isValidField } from "@/core/reports/dataSources";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("reports", "edit"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
    }

    await connectDB();
    const report = await ReportDefinition.findOne({ _id: id, businessId: session.business?.businessId });
    if (!report) {
      return NextResponse.json({ success: false, message: "Report not found" }, { status: 404 });
    }

    const body = await req.json();
    if (body.name !== undefined) report.name = body.name.trim();
    if (body.fields !== undefined) report.fields = body.fields.filter((f: string) => isValidField(report.dataSource, f));
    if (body.filters !== undefined) report.filters = body.filters;
    if (body.groupByField !== undefined) report.groupByField = isValidField(report.dataSource, body.groupByField) ? body.groupByField : undefined;
    if (body.chartType !== undefined) report.chartType = body.chartType;
    if (body.schedule !== undefined) {
      report.schedule.frequency = body.schedule.frequency || "NONE";
      report.schedule.recipientEmails = Array.isArray(body.schedule.recipientEmails) ? body.schedule.recipientEmails : [];
    }

    await report.save();
    return NextResponse.json({ success: true, report });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("reports", "delete"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await params;
    await connectDB();
    await ReportDefinition.deleteOne({ _id: id, businessId: session.business?.businessId });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
