export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";

import Order from "@/models/Order";

export async function GET() {
  try {
    await connectDB();

    const orders = await Order.find({})
      .sort({
        createdAt: -1,
      })
      .limit(500)
      .lean();

    return NextResponse.json({
      success: true,
      orders,
    });
  } catch (error: any) {
    console.log(error);

    return NextResponse.json(
      {
        success: false,
        message:
          error.message ||
          "Failed to fetch orders",
      },
      {
        status: 500,
      }
    );
  }
}
