export const runtime = "nodejs";

import { NextResponse }
from "next/server";

import { connectDB }
from "@/lib/mongodb";

import Order from "@/models/Order";

import { syncTracking }
from "@/lib/shipping/sync-tracking";

import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function POST(req: Request) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("logistics", "manage_settings"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const orders =
      await Order.find({
        status: {
          $in: [
            "DISPATCHED",
            "OUT_FOR_DELIVERY",
          ],
        },

        "shipping.awbNumber": {
          $exists: true,
        },
      });

    const results = [];

    for (const order of orders) {
      try {
        const data =
          await syncTracking(
            order.shipping.awbNumber
          );

        results.push(data);
      } catch (err) {
        console.log(
          "TRACK FAIL:",
          order.orderId
        );
      }
    }

    logAction({
      action: "SYNC",
      entity: "Order",
      after: { processed: results.length },
      req,
    });

    return NextResponse.json({
      success: true,
      processed:
        results.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
