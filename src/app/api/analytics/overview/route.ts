/**
 * GET /api/analytics/overview — business-wide analytics built entirely on
 * AN-CRM's own data (SalesInvoice, CrmJobSheet), not the
 * ecommerce Order collection the old (deleted) version of this route used.
 * Covers both CRM-originated invoices (sourceOrderId "CRM_JOBSHEET:...")
 * and POS quick-sale invoices (sourceOrderId "POS:...") -- see
 * api/crm/revenue/route.ts for the CRM-only equivalent this supersedes
 * for a business-wide view.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import SalesInvoice from "@/models/SalesInvoice";
import CrmJobSheet from "@/models/CrmJobSheet";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";

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
    // SECURITY: businessId used to be trusted straight from the query
    // param with NO ownership check at all -- any authenticated user
    // holding reports.view could pass another business's id and see its
    // full revenue/calls/workorder analytics, and omitting the param
    // entirely aggregated EVERY business's invoices together. Now
    // resolved live against the caller's own verified business (see
    // lib/auth/resolveAuthorizedBusinessId.ts); non-super-admins can
    // never end up unscoped.
    const scope = await resolveAuthorizedVendorScope(
      session.user.id,
      searchParams.get("businessId"),
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    const businessId = scope?.businessId || null;
    if (!businessId && !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "No business context for this account" }, { status: 400 });
    }
    // aggregate() bypasses Mongoose's normal query-casting layer (unlike
    // .find()/.countDocuments()), so a plain string businessId here NEVER
    // matched the real ObjectId field -- revenue silently read 0 for every
    // business the moment this route started actually being scoped to one.
    const businessObjectId = businessId && mongoose.Types.ObjectId.isValid(businessId) ? new mongoose.Types.ObjectId(businessId) : null;
    const invoiceMatch: Record<string, any> = { isDeleted: { $ne: true } };
    if (businessObjectId) invoiceMatch.businessId = businessObjectId;
    // SECURITY: scope.vendorId was resolved above (and already applied to
    // jobsheetMatch below) but never applied here -- every vendor sharing
    // a business saw the WHOLE business's revenue/thisMonth/bySource/
    // statusBreakdown/monthlyTrend numbers, not just their own.
    if (scope?.vendorId && mongoose.Types.ObjectId.isValid(scope.vendorId)) {
      invoiceMatch.vendorId = new mongoose.Types.ObjectId(scope.vendorId);
    }

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

    const jobsheetMatch: Record<string, any> = { isDeleted: { $ne: true } };
    if (businessId) jobsheetMatch.businessId = businessId;
    // Cast to ObjectId (not left as the raw string scope.vendorId) -- the
    // monthlyActivity aggregate below spreads jobsheetMatch straight into
    // an aggregate() $match, which (like invoiceMatch above) bypasses
    // Mongoose's normal query-casting, so an uncast string here would
    // silently never match the real ObjectId field and leak every
    // vendor's monthly workorder trend to every other vendor.
    if (scope?.vendorId && mongoose.Types.ObjectId.isValid(scope.vendorId)) {
      jobsheetMatch.vendorId = new mongoose.Types.ObjectId(scope.vendorId);
    }

    // Calls (CrmCall) were removed from the product -- every business is
    // effectively SC (workorders only) now, so "totalWorkorders" is simply
    // workorder-creation volume. `isSC` is still returned below since the
    // frontend still keys some labels off it.
    const isSC = true;

    const [totalWorkorders, openJobsheets, closedJobsheets, monthlyActivity] = await Promise.all([
      CrmJobSheet.countDocuments(jobsheetMatch),
      CrmJobSheet.countDocuments({ ...jobsheetMatch, status: { $nin: ["CLOSED", "CANCELLED"] } }),
      CrmJobSheet.countDocuments({ ...jobsheetMatch, status: { $in: ["CLOSED", "REPAIR_COMPLETED"] } }),
      CrmJobSheet.aggregate([
        { $match: { ...jobsheetMatch, ...(businessObjectId ? { businessId: businessObjectId } : {}), createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
    ]);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const activityByKey = new Map<string, number>(monthlyActivity.map((m: any) => [`${m._id.year}-${m._id.month}`, m.count]));
    const revenueByKey = new Map<string, number>((invoiceAgg?.monthlyTrend || []).map((m: any) => [`${m._id.year}-${m._id.month}`, m.revenue]));

    // Built as 6 explicit buckets (not just "whichever months invoiceAgg
    // happened to have PAID rows for") so a month with workorders/calls
    // but no revenue yet (or vice versa) still shows up instead of being
    // silently dropped from one series.
    // $year/$month above group in UTC by default, so the key built here
    // must also be UTC-based -- using local getters/setters (as this used
    // to) silently drifted from Mongo's grouping on any host whose local
    // timezone isn't UTC, same bug class as api/analytics/trend's bucket
    // loop (see that file's comment).
    const monthlyTrend: { label: string; revenue: number; activity: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo);
      d.setUTCMonth(d.getUTCMonth() + i);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
      monthlyTrend.push({
        label: `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
        revenue: revenueByKey.get(key) || 0,
        activity: activityByKey.get(key) || 0,
      });
    }

    const totalInvoicesAllStatuses = (invoiceAgg?.statusBreakdown || []).reduce(
      (sum: number, s: any) => sum + (s.count || 0),
      0
    );

    return NextResponse.json({
      success: true,
      isSC,
      revenue: {
        total: invoiceAgg?.totals?.[0]?.sum || 0,
        totalInvoices: invoiceAgg?.totals?.[0]?.count || 0,
        totalInvoicesAllStatuses,
        thisMonth: invoiceAgg?.thisMonth?.[0]?.sum || 0,
        thisMonthInvoices: invoiceAgg?.thisMonth?.[0]?.count || 0,
      },
      bySource: (invoiceAgg?.bySource || []).map((s: any) => ({ source: s._id, revenue: s.sum, count: s.count })),
      statusBreakdown: (invoiceAgg?.statusBreakdown || []).map((s: any) => ({ status: s._id, count: s.count })),
      monthlyTrend,
      operations: {
        totalWorkorders,
        openWorkorders: openJobsheets,
        closedWorkorders: closedJobsheets,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
