/**
 * GET /api/crm/jobsheets/stats — aggregate workorder counts for a
 * business, computed server-side via countDocuments/aggregate rather
 * than derived client-side from a capped (100-row) list page. The SC
 * CRM Overview's period cards (today/week/month/year) and status
 * breakdown need real totals, not "however many rows fit in the first
 * page" -- a busy shop with 300+ workorders/year would silently
 * undercount if computed from the capped list endpoint instead.
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";

const OPEN_STATUSES = ["CREATED", "REPAIR_STARTED", "REPAIR_IN_PROGRESS", "REPAIR_COMPLETED"];

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "view"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    const h = await headers();
    const requestedBizId = h.get("x-active-business-id") || req.nextUrl.searchParams.get("businessId");

    await connectDB();
    const scope = await resolveAuthorizedVendorScope(
      session.user.id,
      requestedBizId,
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    const bizId = scope?.businessId || null;
    if (!bizId || !mongoose.Types.ObjectId.isValid(bizId)) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }
    const businessId = new mongoose.Types.ObjectId(bizId);
    const baseFilter: Record<string, unknown> = { isDeleted: false, businessId };
    if (scope?.vendorId) baseFilter.vendorId = new mongoose.Types.ObjectId(scope.vendorId);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Monday
    const startOfWeek = new Date(startOfToday.getTime() - dayOfWeek * 86400000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

    const [today, thisWeek, thisMonth, thisYear, openCount, overdueCount, closedThisMonth, byStatusRows] =
      await Promise.all([
        CrmJobSheet.countDocuments({ ...baseFilter, createdAt: { $gte: startOfToday } }),
        CrmJobSheet.countDocuments({ ...baseFilter, createdAt: { $gte: startOfWeek } }),
        CrmJobSheet.countDocuments({ ...baseFilter, createdAt: { $gte: startOfMonth } }),
        CrmJobSheet.countDocuments({ ...baseFilter, createdAt: { $gte: startOfYear } }),
        CrmJobSheet.countDocuments({ ...baseFilter, status: { $in: OPEN_STATUSES } }),
        CrmJobSheet.countDocuments({ ...baseFilter, status: { $in: OPEN_STATUSES }, createdAt: { $lte: sevenDaysAgo } }),
        CrmJobSheet.countDocuments({ ...baseFilter, status: "CLOSED", createdAt: { $gte: startOfMonth } }),
        CrmJobSheet.aggregate([
          { $match: baseFilter },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
      ]);

    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows) byStatus[row._id] = row.count;

    return NextResponse.json({
      success: true,
      today,
      thisWeek,
      thisMonth,
      thisYear,
      openCount,
      overdueCount,
      closedThisMonth,
      byStatus,
    });
  } catch (err: any) {
    console.error("CRM jobsheets stats GET error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
