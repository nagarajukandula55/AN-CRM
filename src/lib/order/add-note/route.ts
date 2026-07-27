export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";

import Order from "@/models/Order";

export async function POST(req: Request) {
  try {
    await connectDB();

    const body = await req.json();

    const {
      orderId,
      note,
      by = "ADMIN",
      type = "INTERNAL",
    } = body;

    if (!orderId || !note) {
      return NextResponse.json(
        {
          success: false,
          message:
            "orderId and note required",
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

    if (!order.notes) {
      order.notes = [];
    }

    order.notes.push({
      note,
      by,
      type,
      at: new Date(),
    });

    order.events.push({
      type: "NOTE_ADDED",
      message: note,
      by,
      createdAt: new Date(),
    });

    await order.save();

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.log(error);

    return NextResponse.json(
      {
        success: false,
        message:
          error.message ||
          "Failed to add note",
      },
      {
        status: 500,
      }
    );
  }
}
