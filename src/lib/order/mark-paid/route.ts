export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";

import Order from "@/models/Order";

import { updateOrderStatus } from "@/lib/order/update-order-status";

export async function POST(req: Request) {
  try {
    await connectDB();

    const body = await req.json();

    const {
      orderId,
      utr,
      transactionId,
      by,
    } = body;

    if (!orderId) {
      return NextResponse.json(
        {
          success: false,
          message: "orderId required",
        },
        {
          status: 400,
        }
      );
    }

    const order = await Order.findOne({
      orderId,
    });

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          message: "Order not found",
        },
        {
          status: 404,
        }
      );
    }

    /* =========================================
       PAYMENT UPDATE
    ========================================= */

    order.payment = {
      ...order.payment,
      status: "SUCCESS",
      utr,
      transactionId,
      paidAt: new Date(),
    };

    order.paymentVerified = true;

    order.events.push({
      type: "PAYMENT_VERIFIED",
      message:
        "Payment marked as paid manually",
      by: by || "ADMIN",
      data: {
        utr,
        transactionId,
      },
      createdAt: new Date(),
    });

    await order.save();

    /* =========================================
       STATUS UPDATE
    ========================================= */

    const result =
      await updateOrderStatus({
        orderId,
        newStatus: "PAID",
        by: by || "ADMIN",
        note: "Payment verified",
      });

    return NextResponse.json({
      success: true,
      order: result.order,
    });
  } catch (error: any) {
    console.log(error);

    return NextResponse.json(
      {
        success: false,
        message:
          error.message ||
          "Payment update failed",
      },
      {
        status: 500,
      }
    );
  }
}
