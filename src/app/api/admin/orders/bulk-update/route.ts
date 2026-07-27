export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";

import { updateOrderStatus } from "@/lib/order/update-order-status";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function POST(req: Request) {
  try {
    // Was callable by anyone with no session check at all — any request
    // could change any order's status. Matches the auth gate already on
    // /api/orders/mark-paid.
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();

    const {
      orderIds,
      status,
      by = "ADMIN",
    } = body;

    if (
      !Array.isArray(orderIds) ||
      !status
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid payload",
        },
        {
          status: 400,
        }
      );
    }

    const results = [];

    for (const orderId of orderIds) {
      try {
        const result =
          await updateOrderStatus({
            orderId,
            newStatus: status,
            by,
          });

        logAction({
          action: "BULK_UPDATE",
          entity: "Order",
          entityId: orderId,
          after: { status },
          req,
        });

        results.push({
          orderId,
          success: true,
          order: result.order,
        });
      } catch (err: any) {
        results.push({
          orderId,
          success: false,
          message: err.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message ||
          "Bulk update failed",
      },
      {
        status: 500,
      }
    );
  }
}
