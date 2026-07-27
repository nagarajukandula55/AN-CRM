export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";

import Order from "@/models/Order";

export async function GET(
  req: Request,
  { params }: any
) {
  try {
    await connectDB();

    const order = await Order.findOne({
      orderId: params.id,
    }).lean();

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
      order,
    });
  } catch (error: any) {
    console.log(error);

    return NextResponse.json(
      {
        success: false,
        message:
          error.message ||
          "Failed to fetch order",
      },
      {
        status: 500,
      }
    );
  }
}
