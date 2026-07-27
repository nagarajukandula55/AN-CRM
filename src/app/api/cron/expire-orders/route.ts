export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";

import Order from "@/models/Order";

import {
  releaseStock,
} from "@/lib/order/reserveStock";

/* =========================================================
   EXPIRE PENDING ORDERS
========================================================= */

export async function GET() {
  try {
    await connectDB();

    /* =========================================================
       FIND EXPIRED ORDERS
    ========================================================= */

    const expiredOrders =
      await Order.find({
        status:
          "PENDING_PAYMENT",

        expiresAt: {
          $lte: new Date(),
        },
      });

    if (
      !expiredOrders ||
      expiredOrders.length === 0
    ) {
      return NextResponse.json({
        success: true,
        expiredCount: 0,
      });
    }

    let expiredCount = 0;

    /* =========================================================
       PROCESS
    ========================================================= */

    for (const order of expiredOrders) {
      /* =========================================================
         RELEASE STOCK
      ========================================================= */

      if (
        order.stockReserved &&
        Array.isArray(order.cart)
      ) {
        await releaseStock(
          order.cart
        );

        order.stockReserved =
          false;
      }

      /* =========================================================
         UPDATE ORDER
      ========================================================= */

      order.status = "EXPIRED";

      order.locked = true;

      order.events.push({
        type: "ORDER_EXPIRED",

        message:
          "Order expired automatically",

        createdAt: new Date(),
      });

      await order.save();

      expiredCount++;
    }

    /* =========================================================
       RESPONSE
    ========================================================= */

    return NextResponse.json({
      success: true,
      expiredCount,
    });
  } catch (err: any) {
    console.error(
      "EXPIRE ORDERS CRON ERROR:",
      err
    );

    return NextResponse.json(
      {
        success: false,

        message:
          err?.message ||
          "Cron failed",
      },
      { status: 500 }
    );
  }
}
