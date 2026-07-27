export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";

import { updateOrderStatus } from "@/lib/order/update-order-status";

export async function POST(req: Request) {
  try {
    await connectDB();

    const body = await req.json();

    const {
      orderId,
      status,
      note,
      by,
    } = body;

    if (!orderId || !status) {
      return NextResponse.json(
        {
          success: false,
          message:
            "orderId and status required",
        },
        {
          status: 400,
        }
      );
    }

    const result =
      await updateOrderStatus({
        orderId,
        newStatus: status,
        note,
        by,
      });

    return NextResponse.json(result);
  } catch (error: any) {
    console.log(error);

    return NextResponse.json(
      {
        success: false,
        message:
          error.message ||
          "Status update failed",
      },
      {
        status: 500,
      }
    );
  }
}
