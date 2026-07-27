import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import ProductionOrder from "@/models/ProductionOrder";
import ProductionOrderItem from "@/models/ProductionOrderItem";
import ProductionBatch from "@/models/ProductionBatch";
import { logAction } from "@/lib/audit/logAction";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();

    const { id } = await context.params;

    const [order, items, batches] = await Promise.all([
      ProductionOrder.findOne({ _id: id, isDeleted: false }).lean(),
      ProductionOrderItem.find({ productionOrderId: new Types.ObjectId(id) }).lean(),
      ProductionBatch.find({ productionOrderId: new Types.ObjectId(id) })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Production order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { ...order, items, batches },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();

    const { id } = await context.params;
    const body = await req.json();

    const order = await ProductionOrder.findOne({ _id: id, isDeleted: false });
    if (!order) {
      return NextResponse.json(
        { success: false, error: "Production order not found" },
        { status: 404 }
      );
    }

    // Guard: cannot edit completed or cancelled orders
    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot update a ${order.status.toLowerCase()} order`,
        },
        { status: 400 }
      );
    }

    const allowedFields = [
      "status",
      "notes",
      "priority",
      "plannedStartDate",
      "plannedEndDate",
      "productName",
      "productSku",
      "plannedQuantity",
      "unit",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const updated = await ProductionOrder.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    ).lean();

    logAction({
      action: "UPDATE",
      entity: "ProductionOrder",
      entityId: id,
      after: updated,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();

    const { id } = await context.params;

    const order = await ProductionOrder.findOne({ _id: id, isDeleted: false });
    if (!order) {
      return NextResponse.json(
        { success: false, error: "Production order not found" },
        { status: 404 }
      );
    }

    if (order.status === "IN_PROGRESS") {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot cancel an order that is currently in progress",
        },
        { status: 400 }
      );
    }

    // Soft delete / cancel
    await ProductionOrder.findByIdAndUpdate(id, {
      $set: { status: "CANCELLED", isDeleted: true },
    });

    logAction({
      action: "CANCEL",
      entity: "ProductionOrder",
      entityId: id,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({
      success: true,
      message: "Production order cancelled",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
