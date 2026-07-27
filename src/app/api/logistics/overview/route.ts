import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/core/db/mongodb";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import Order from "@/models/Order";
import Warehouse from "@/models/Warehouse";

/**
 * GET /api/logistics/overview
 *
 * Backs src/app/admin/logistics/page.tsx. There is no dedicated Shipment
 * model in this codebase — shipment/tracking fields (courierPartner,
 * awbNumber, trackingStatus, shippedAt, deliveredAt, dispatchType, etc.)
 * live directly on Order.shipping (see models/Order.ts's ShippingSchema).
 * This route reads from there rather than inventing a parallel Shipment
 * collection that would drift out of sync with the real order data.
 *
 * "Active shipments" = orders with shipping.shipmentCreated true and no
 * deliveredAt yet. "Avg delivery" = average days between shippedAt and
 * deliveredAt for orders delivered in the last 30 days. Delivery zones
 * isn't tracked as its own concept anywhere in the schema (no
 * region/zone field on Order or Warehouse) — returned as the count of
 * distinct courier partners actually used instead of a fabricated number,
 * with a note so the UI can be honest about what it's showing.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.business) {
      return NextResponse.json(
        { success: false, error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("logistics", "view"));

    await connectDB();
    const businessId = new Types.ObjectId(session.business.businessId);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [activeShipments, warehouseCount, courierPartners, deliveredOrders, recentShipments] = await Promise.all([
      Order.countDocuments({
        businessId,
        "shipping.shipmentCreated": true,
        "shipping.deliveredAt": { $in: [null, undefined] },
      }),
      Warehouse.countDocuments({ businessId }),
      Order.distinct("shipping.courierPartner", { businessId, "shipping.courierPartner": { $ne: null } }),
      Order.find({
        businessId,
        "shipping.deliveredAt": { $gte: thirtyDaysAgo },
        "shipping.shippedAt": { $ne: null },
      })
        .select("shipping.shippedAt shipping.deliveredAt")
        .lean(),
      Order.find({ businessId, "shipping.shipmentCreated": true })
        .sort({ "shipping.shippedAt": -1 })
        .limit(20)
        .select("invoice.invoiceNumber shipping address customer")
        .lean()
        .catch(() => []),
    ]);

    const deliveryDurationsDays = deliveredOrders
      .map((o: any) => {
        const shipped = o.shipping?.shippedAt ? new Date(o.shipping.shippedAt).getTime() : null;
        const delivered = o.shipping?.deliveredAt ? new Date(o.shipping.deliveredAt).getTime() : null;
        if (!shipped || !delivered) return null;
        return (delivered - shipped) / (1000 * 60 * 60 * 24);
      })
      .filter((d: number | null): d is number => d !== null);

    const avgDeliveryDays =
      deliveryDurationsDays.length > 0
        ? Math.round((deliveryDurationsDays.reduce((a: number, b: number) => a + b, 0) / deliveryDurationsDays.length) * 10) / 10
        : null;

    return NextResponse.json({
      success: true,
      activeShipments,
      warehouseCount,
      courierPartnersInUse: courierPartners.length,
      avgDeliveryDays, // null if no delivered orders in the last 30 days, not a fabricated placeholder
      recentShipments: recentShipments.map((o: any) => ({
        orderId: String(o._id),
        invoiceNumber: o.invoice?.invoiceNumber || null,
        courierPartner: o.shipping?.courierPartner || null,
        awbNumber: o.shipping?.awbNumber || null,
        trackingStatus: o.shipping?.trackingStatus || null,
        trackingUrl: o.shipping?.trackingUrl || null,
        shippedAt: o.shipping?.shippedAt || null,
        deliveredAt: o.shipping?.deliveredAt || null,
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
