export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";

import Order from "@/models/Order";

export async function GET(
  req: Request,
  context: any
) {
  try {
    await connectDB();

    const order: any =
      await Order.findOne({
        orderId: (await context.params).id,
      })
        .select(
          "timeline statusHistory events"
        )
        .lean();

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

    return NextResponse.json({
      success: true,

      timeline: order?.timeline || [],

      statusHistory:
        order?.statusHistory || [],

      events: order?.events || [],
    });
  } catch (error: any) {
    console.log(error);

    return NextResponse.json(
      {
        success: false,
        message:
          error.message ||
          "Failed to fetch timeline",
      },
      {
        status: 500,
      }
    );
  }
}
