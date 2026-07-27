export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";

import Order from "@/models/Order";

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
      requirePermission(session as any, buildPermissionCode("logistics", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body = await req.json();

    const {
      orderId,
      weight,
      length,
      breadth,
      height,
    } = body;

    const order = await Order.findOne({
      orderId,
    });

    if (!order) {
      return NextResponse.json({
        success: false,
        message: "Order not found",
      });
    }

    order.shipping = {
      ...order.shipping,

      package: {
        weight,
        length,
        breadth,
        height,
      },
    };

    await order.save();

    logAction({
      action: "UPDATE",
      entity: "Order",
      entityId: order._id?.toString(),
      after: order.shipping,
      req,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
