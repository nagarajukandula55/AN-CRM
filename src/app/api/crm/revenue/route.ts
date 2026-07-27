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

    const invoices = await SalesInvoice.find(match)
      .select("grandTotal status createdAt")
      .lean();

    const paidStatuses = new Set(["PAID"]);
    let totalRevenue = 0;
    let revenueThisMonth = 0;
    let outstanding = 0;
    let paidCount = 0;

    for (const inv of invoices as any[]) {
      const amount = inv.grandTotal || 0;
      if (paidStatuses.has(inv.status)) {
        totalRevenue += amount;
        paidCount += 1;
        if (new Date(inv.createdAt) >= monthStart) {
          revenueThisMonth += amount;
        }
      } else if (inv.status !== "CANCELLED" && inv.status !== "DRAFT") {
        outstanding += amount;
      }
    }

    return NextResponse.json({
      success: true,
      totalRevenue,
      revenueThisMonth,
      outstanding,
      invoiceCount: invoices.length,
      paidCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to load CRM revenue" },
      { status: 500 }
    );
  }
}
