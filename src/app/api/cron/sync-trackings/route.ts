import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import { syncTracking } from "@/lib/shipping/sync-tracking";

export const runtime = "nodejs";

export async function GET() {
  try {
    await connectDB();

    const orders = await Order.find({
      "shipping.awbNumber": { $exists: true },
      status: { $ne: "DELIVERED" },
    }).lean();

    for (const order of orders) {
      try {
        await syncTracking(order.shipping.awbNumber);
      } catch (e) {
        console.log("Sync failed:", order.orderId);
      }
    }

    return NextResponse.json({
      success: true,
      updated: orders.length,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      message: err.message,
    });
  }
}
