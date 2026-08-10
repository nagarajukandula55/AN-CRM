/**
 * CRM Revenue API
 * GET /api/crm/revenue?businessId= — aggregates SalesInvoice documents
 * generated from CRM job-sheet closures (sourceOrderId starting with
 * "CRM_JOBSHEET:", set in crm/jobsheets/[id]/close/route.ts) so the CRM
 * Overview dashboard can show revenue figures without duplicating billing
 * logic — SalesInvoice remains the single source of truth for amounts.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import SalesInvoice from "@/models/SalesInvoice";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

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
    // SECURITY: businessId used to be trusted straight from the query
    // param with NO ownership check, and omitting it entirely aggregated
    // EVERY business's CRM revenue together. Same fix pattern as
    // customers/deals.
    const businessId = await resolveAuthorizedBusinessId(
      session.user.id,
      searchParams.get("businessId"),
      !!session.isSuperAdmin,
      session.business?.businessId || null
    );
    if (!businessId && !session.isSuperAdmin) {
      return NextResponse.json({
        success: true,
        totalRevenue: 0,
        revenueThisMonth: 0,
        outstanding: 0,
        invoiceCount: 0,
        paidCount: 0,
      });
    }

    const match: Record<string, any> = {
      sourceOrderId: { $regex: "^CRM_JOBSHEET:" },
      isDeleted: { $ne: true },
    };
    // aggregate() bypasses Mongoose's query-casting layer (unlike
    // .find()), so a plain string businessId here never matched the real
    // ObjectId field -- CRM Overview's revenue figures silently read 0.
    if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
      match.businessId = new mongoose.Types.ObjectId(businessId);
    }

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
