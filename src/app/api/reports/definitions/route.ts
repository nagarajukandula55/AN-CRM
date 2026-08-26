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
import { resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    // SECURITY: session.business?.businessId hard-required a BusinessMember
    // row, which a vendor Owner never has -- blocked every vendor Owner
    // outright. Also never scoped by vendorId, so any vendor sharing the
    // platform Business saw (and could run) every other vendor's saved
    // reports. resolveAuthorizedVendorScope covers both.
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
    const filter: Record<string, unknown> = { businessId: scope.businessId };
    // A vendor sees their own saved reports plus any business-level ones
    // (vendorId unset) -- same private-list-with-shared-default pattern as
    // fault-codes/solutions.
    if (scope.vendorId) filter.$or = [{ vendorId: scope.vendorId }, { vendorId: null }];
    const reports = await ReportDefinition.find(filter)
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
    const scope = await resolveAuthorizedVendorScope(
      session.user.id,
      req.nextUrl.searchParams.get("businessId"),
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    if (!scope?.businessId) {
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
      businessId: scope.businessId,
      vendorId: scope.vendorId || null,
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
