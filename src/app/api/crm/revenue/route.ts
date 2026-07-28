/**
 * CRM Revenue API
 * GET /api/crm/revenue?businessId= — aggregates SalesInvoice documents
 * generated from CRM job-sheet closures (sourceOrderId starting with
 * "CRM_JOBSHEET:", set in crm/jobsheets/[id]/close/route.ts) so the CRM
 * Overview dashboard can show revenue figures without duplicating billing
 * logic — SalesInvoice remains the single source of truth for amounts.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SalesInvoice from "@/models/SalesInvoice";
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
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "view"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");

    const match: Record<string, any> = {
      sourceOrderId: { $regex: "^CRM_JOBSHEET:" },
      isDeleted: { $ne: true },
    };
    if (businessId) match.businessId = businessId;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Summed via an aggregation pipeline rather than pulling every
    // matching invoice into JS -- at real invoice volume, .find().lean()
    // here would transfer every document over the wire just to add up
    // four numbers server-side. One round trip via $facet instead.
    const [agg] = await SalesInvoice.aggregate([
      { $match: match },
      {
        $facet: {
          paidTotal: [
            { $match: { status: "PAID" } },
            { $group: { _id: null, sum: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
          ],
          paidThisMonth: [
            { $match: { status: "PAID", createdAt: { $gte: monthStart } } },
            { $group: { _id: null, sum: { $sum: "$grandTotal" } } },
          ],
          outstanding: [
            { $match: { status: { $nin: ["PAID", "CANCELLED", "DRAFT"] } } },
            { $group: { _id: null, sum: { $sum: "$grandTotal" } } },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ]);

    const totalRevenue = agg?.paidTotal?.[0]?.sum || 0;
    const paidCount = agg?.paidTotal?.[0]?.count || 0;
    const revenueThisMonth = agg?.paidThisMonth?.[0]?.sum || 0;
    const outstanding = agg?.outstanding?.[0]?.sum || 0;
    const invoiceCount = agg?.totalCount?.[0]?.count || 0;

    return NextResponse.json({
      success: true,
      totalRevenue,
      revenueThisMonth,
      outstanding,
      invoiceCount,
      paidCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to load CRM revenue" },
      { status: 500 }
    );
  }
}
