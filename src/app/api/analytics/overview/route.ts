import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/core/db/mongodb";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import Order from "@/models/Order";
import InventoryItem from "@/models/InventoryItem";
import Business from "@/models/Business";

/**
 * GET /api/analytics/overview?period=7d|30d|90d
 *
 * Backs src/app/admin/analytics/page.tsx. Deliberately a separate route
 * from /api/dashboard/overview (which already exists and serves a
 * different, differently-shaped payload for the main dashboard) rather
 * than reshaping that route and risking breaking its existing caller —
 * this one returns exactly the shape the Analytics page's `getMockData()`
 * fallback already expects (revenue/orders/customers with trend arrays,
 * inventory counts, topBusinesses), so the page can stop silently falling
 * back to mock data.
 *
 * Permission check uses buildPermissionCode("analytics", "view") — the
 * canonical MODULEKEY.ACTIONKEY code generator from core/access/actions.ts,
 * same as every other route after the permission-code convention migration
 * (see permission.guard.ts's top comment for the history of the old
 * lowercase-dot convention this replaced).
 */

const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.business) {
      return NextResponse.json(
        { success: false, error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("analytics", "view"));

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "30d";
    const days = PERIOD_DAYS[period] ?? 30;

    await connectDB();

    const businessId = new Types.ObjectId(session.business.businessId);
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - days);
    const prevPeriodStart = new Date();
    prevPeriodStart.setDate(prevPeriodStart.getDate() - days * 2);

    // ── Orders + revenue within the period, plus the prior equal-length
    // period (for growth %), plus a per-day trend for the chart. ──────────
    const [currentAgg, previousAgg, trendAgg, customerAgg, inventoryAgg, businesses] = await Promise.all([
      Order.aggregate([
        { $match: { businessId, createdAt: { $gte: periodStart } } },
        { $group: { _id: null, totalRevenue: { $sum: "$amount" }, totalOrders: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { businessId, createdAt: { $gte: prevPeriodStart, $lt: periodStart } } },
        { $group: { _id: null, totalRevenue: { $sum: "$amount" }, totalOrders: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { businessId, createdAt: { $gte: periodStart } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            revenue: { $sum: "$amount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { businessId, createdAt: { $gte: periodStart }, customerId: { $ne: null } } },
        { $group: { _id: "$customerId" } },
        { $count: "distinctCustomers" },
      ]),
      InventoryItem.aggregate([
        { $match: { businessId } },
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            lowStock: {
              $sum: {
                $cond: [{ $lte: ["$availableQuantity", "$reorderLevel"] }, 1, 0],
              },
            },
            outOfStock: {
              $sum: { $cond: [{ $lte: ["$availableQuantity", 0] }, 1, 0] },
            },
          },
        },
      ]).catch(() => []), // defensive: InventoryItem schema fields vary by item type, don't fail the whole page over this
      Business.find({ isActive: true }).select("name").limit(5).lean(),
    ]);

    const current = currentAgg[0] || { totalRevenue: 0, totalOrders: 0 };
    const previous = previousAgg[0] || { totalRevenue: 0, totalOrders: 0 };
    const inv = inventoryAgg[0] || { totalItems: 0, lowStock: 0, outOfStock: 0 };
    const distinctCustomers = customerAgg[0]?.distinctCustomers || 0;

    const growth = (curr: number, prev: number) =>
      prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : curr > 0 ? 100 : 0;

    return NextResponse.json({
      success: true,
      revenue: {
        total: current.totalRevenue,
        growth: growth(current.totalRevenue, previous.totalRevenue),
        trend: trendAgg.map((d: any) => d.revenue),
      },
      orders: {
        total: current.totalOrders,
        growth: growth(current.totalOrders, previous.totalOrders),
        trend: trendAgg.map((d: any) => d.orders),
      },
      customers: {
        total: distinctCustomers,
        // No prior-period comparison for distinct customers yet — would need
        // a second aggregation; left as 0 rather than a fabricated number.
        growth: 0,
        trend: [],
      },
      inventory: {
        totalItems: inv.totalItems,
        lowStock: inv.lowStock,
        outOfStock: inv.outOfStock,
      },
      // Real business names, but revenue-per-business is NOT computed here
      // (would require summing Orders per businessId across all businesses,
      // which the current single-business-scoped session can't do without
      // a platform-wide/super-admin query) — left at 0 rather than mocked.
      // TODO: build this out properly once a super-admin cross-business
      // reporting permission exists.
      topBusinesses: businesses.map((b: any) => ({
        name: b.name,
        revenue: 0,
        growth: 0,
      })),
    });
  } catch (error: any) {
    const status = error?.code === "UNAUTHORIZED" ? 401 : error?.code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json(
      { success: false, error: error?.message || "Internal Server Error" },
      { status }
    );
  }
}
