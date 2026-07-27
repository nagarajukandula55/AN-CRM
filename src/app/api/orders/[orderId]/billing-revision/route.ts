import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import { notifyUser } from "@/services/notification.service";

/* ================= CORS ================= */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * PATCH /api/orders/[orderId]/billing-revision — admin/vendor shares
 * revised (bulk) pricing + separate shipping charges with the retailer
 * who placed a bulk order (see OrderService.createOrder's isBulkOrder
 * path). Notifies the customer once billing is shared.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    await connectDB();

    const { orderId } = await params;
    const revisedByUserId = req.headers.get("x-user-id") || undefined;
    const body = await req.json();
    const { revisedAmount, revisedShippingCharges, notes } = body;

    if (revisedAmount == null || isNaN(Number(revisedAmount))) {
      return NextResponse.json(
        { success: false, message: "revisedAmount is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    if (!order.isBulkOrder) {
      return NextResponse.json(
        { success: false, message: "Not a bulk order" },
        { status: 400, headers: corsHeaders }
      );
    }

    order.billingRevision = {
      status: "SHARED",
      revisedAmount: Number(revisedAmount),
      revisedShippingCharges: Number(revisedShippingCharges || 0),
      notes: notes || "",
      revisedBy: revisedByUserId,
      revisedAt: new Date(),
    };
    order.status = "BILLING_REVISED";
    await order.save();

    if (order.userId) {
      notifyUser({
        userId: String(order.userId),
        title: "Your bulk order billing is ready",
        message: `Order ${orderId}: revised total ₹${Number(revisedAmount).toFixed(2)}${
          revisedShippingCharges ? ` + ₹${Number(revisedShippingCharges).toFixed(2)} shipping` : ""
        }.`,
        link: `/orders/${orderId}`,
      }).catch(() => {});
    }

    return NextResponse.json(
      { success: true, order },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("PATCH billing-revision failed:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
