import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import ProductionOrder from "@/models/ProductionOrder";
import ProductionBatch from "@/models/ProductionBatch";

async function getNextBatchNumber(): Promise<string> {
  const last = await ProductionBatch.findOne(
    {},
    { batchNumber: 1 },
    { sort: { createdAt: -1 } }
  ).lean();
  if (!last || !(last as any).batchNumber) return "BATCH-0001";
  const match = ((last as any).batchNumber as string).match(/BATCH-(\d+)$/);
  const num = match ? parseInt(match[1]) + 1 : 1;
  return `BATCH-${String(num).padStart(4, "0")}`;
}

export async function POST(
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
        { success: false, error: "Production order is already in progress" },
        { status: 400 }
      );
    }

    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot start a ${order.status.toLowerCase()} order`,
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { operatorId, operatorName, machineId, machineName, notes } = body;

    const batchNumber = await getNextBatchNumber();

    // Create production batch
    const batch = await ProductionBatch.create({
      batchNumber,
      productionOrderId: new Types.ObjectId(id),
      businessId: order.businessId,
      status: "RUNNING",
      startedAt: new Date(),
      plannedQuantity: order.plannedQuantity,
      producedQuantity: 0,
      rejectedQuantity: 0,
      unit: order.unit,
      operatorId: operatorId || userId,
      operatorName: operatorName || undefined,
      machineId: machineId || undefined,
      machineName: machineName || undefined,
      notes: notes || undefined,
    });

    // Update order status to IN_PROGRESS
    const updatedOrder = await ProductionOrder.findByIdAndUpdate(
      id,
      {
        $set: {
          status: "IN_PROGRESS",
          actualStartDate: new Date(),
        },
      },
      { new: true }
    ).lean();

    return NextResponse.json(
      { success: true, data: { order: updatedOrder, batch } },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
