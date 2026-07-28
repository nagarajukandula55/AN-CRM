/**
 * GET /api/analytics/overview — business-wide analytics built entirely on
 * AN-CRM's own data (SalesInvoice, CrmCall, CrmJobSheet), not the
 * ecommerce Order collection the old (deleted) version of this route used.
 * Covers both CRM-originated invoices (sourceOrderId "CRM_JOBSHEET:...")
 * and POS quick-sale invoices (sourceOrderId "POS:...") -- see
 * api/crm/revenue/route.ts for the CRM-only equivalent this supersedes
 * for a business-wide view.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SalesInvoice from "@/models/SalesInvoice";
import CrmCall from "@/models/CrmCall";
import CrmJobSheet from "@/models/CrmJobSheet";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("reports", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const invoiceMatch: Record<string, any> = { isDeleted: { $ne: true } };
    if (businessId) invoiceMatch.businessId = businessId;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [invoiceAgg] = await SalesInvoice.aggregate([
      { $match: invoiceMatch },
      {
        $facet: {
          totals: [
            { $match: { status: "PAID" } },
            { $group: { _id: null, sum: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
          ],
          thisMonth: [
            { $match: { status: "PAID", createdAt: { $gte: monthStart } } },
            { $group: { _id: null, sum: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
          ],
          bySource: [
            {
              $group: {
                _id: { $cond: [{ $regexMatch: { input: { $ifNull: ["$sourceOrderId", ""] }, regex: /^POS:/ } }, "POS", "CRM"] },
                sum: { $sum: { $cond: [{ $eq: ["$status", "PAID"] }, "$grandTotal", 0] } },
                count: { $sum: 1 },
              },
            },
          ],
          statusBreakdown: [
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ],
          monthlyTrend: [
            { $match: { status: "PAID", createdAt: { $gte: sixMonthsAgo } } },
            {
              $group: {
                _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
                revenue: { $sum: "$grandTotal" },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ],
        },
      },
    ]);

    const callMatch: Record<string, any> = {};
    if (businessId) callMatch.businessId = businessId;
    const jobsheetMatch: Record<string, any> = { isDeleted: { $ne: true } };
    if (businessId) jobsheetMatch.businessId = businessId;

    const [totalCalls, openJobsheets, closedJobsheets] = await Promise.all([
      CrmCall.countDocuments(callMatch),
      CrmJobSheet.countDocuments({ ...jobsheetMatch, status: { $nin: ["CLOSED", "CANCELLED"] } }),
      CrmJobSheet.countDocuments({ ...jobsheetMatch, status: { $in: ["CLOSED", "REPAIR_COMPLETED"] } }),
    ]);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return NextResponse.json({
      success: true,
      revenue: {
        total: invoiceAgg?.totals?.[0]?.sum || 0,
        totalInvoices: invoiceAgg?.totals?.[0]?.count || 0,
        thisMonth: invoiceAgg?.thisMonth?.[0]?.sum || 0,
        thisMonthInvoices: invoiceAgg?.thisMonth?.[0]?.count || 0,
      },
      bySource: (invoiceAgg?.bySource || []).map((s: any) => ({ source: s._id, revenue: s.sum, count: s.count })),
      statusBreakdown: (invoiceAgg?.statusBreakdown || []).map((s: any) => ({ status: s._id, count: s.count })),
      monthlyTrend: (invoiceAgg?.monthlyTrend || []).map((m: any) => ({
        label: `${monthNames[m._id.month - 1]} ${m._id.year}`,
        revenue: m.revenue,
      })),
      operations: {
        totalCalls,
        openWorkorders: openJobsheets,
        closedWorkorders: closedJobsheets,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
