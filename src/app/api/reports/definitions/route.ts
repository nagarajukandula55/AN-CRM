/**
 * GET  /api/reports/definitions — list this business's saved reports.
 * POST /api/reports/definitions — save a new one.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import ReportDefinition from "@/models/ReportDefinition";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { isValidField } from "@/core/reports/dataSources";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.business?.businessId) {
      return NextResponse.json({ success: false, message: "No active business" }, { status: 400 });
    }

    await connectDB();
    const reports = await ReportDefinition.find({ businessId: session.business.businessId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, reports });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("reports", "create"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }
    if (!session.business?.businessId) {
      return NextResponse.json({ success: false, message: "No active business" }, { status: 400 });
    }

    const body = await req.json();
    const { name, dataSource, fields, filters, groupByField, chartType, schedule } = body;

    if (!name?.trim() || !dataSource) {
      return NextResponse.json({ success: false, message: "name and dataSource are required" }, { status: 400 });
    }
    const safeFields = Array.isArray(fields) ? fields.filter((f: string) => isValidField(dataSource, f)) : [];

    await connectDB();
    const report = await ReportDefinition.create({
      businessId: session.business.businessId,
      name: name.trim(),
      dataSource,
      fields: safeFields,
      filters: Array.isArray(filters) ? filters : [],
      groupByField: groupByField && isValidField(dataSource, groupByField) ? groupByField : undefined,
      chartType: chartType || "TABLE",
      schedule: {
        frequency: schedule?.frequency || "NONE",
        recipientEmails: Array.isArray(schedule?.recipientEmails) ? schedule.recipientEmails : [],
        sendToTelegram: !!schedule?.sendToTelegram,
      },
      createdBy: new mongoose.Types.ObjectId(session.user.id),
    });

    return NextResponse.json({ success: true, report }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
