import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import mongoose from "mongoose";
import ProductionOrder from "@/models/ProductionOrder";
import ProductionBatch from "@/models/ProductionBatch";
import ProductionOrderItem from "@/models/ProductionOrderItem";

// Inline FinishedGood model (lightweight — no separate model file required yet)
const FinishedGoodSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    productionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductionOrder", index: true },
    productionBatchId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductionBatch" },
    productName: { type: String, required: true },
    productSku: { type: String },
    quantity: { type: Number, required: true },
    unit: { type: String, default: "pcs" },
    batchNumber: { type: String },
    producedAt: { type: Date, default: Date.now },
    qualityChecked: { type: Boolean, default: false },
    qualityNotes: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

const FinishedGood =
  mongoose.models.FinishedGood ||
  mongoose.model("FinishedGood", FinishedGoodSchema);

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

    if (order.status !== "IN_PROGRESS") {
      return NextResponse.json(
        {
          success: false,
          error: "Only orders that are IN_PROGRESS can be completed",
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      producedQuantity,
      rejectedQuantity = 0,
      qualityChecked = false,
      qualityNotes,
      notes,
      createFinishedGoodEntry = true,
    } = body;

    if (producedQuantity === undefined || producedQuantity === null) {
      return NextResponse.json(
        { success: false, error: "producedQuantity is required" },
        { status: 400 }
      );
    }

    const now = new Date();

    // Find the active batch for this order
    const batch = await ProductionBatch.findOneAndUpdate(
      {
        productionOrderId: new Types.ObjectId(id),
        status: "RUNNING",
      },
      {
        $set: {
          status: "COMPLETED",
          completedAt: now,
          producedQuantity,
          rejectedQuantity,
          qualityChecked,
          qualityNotes: qualityNotes || undefined,
          notes: notes || undefined,
        },
      },
      { new: true, sort: { createdAt: -1 } }
    );

    // Update order
    const updatedOrder = await ProductionOrder.findByIdAndUpdate(
      id,
      {
        $set: {
          status: "COMPLETED",
          actualEndDate: now,
          producedQuantity,
        },
      },
      { new: true }
    ).lean();

    // Optionally create FinishedGood inventory entry
    let finishedGood = null;
    if (createFinishedGoodEntry && producedQuantity > 0) {
      finishedGood = await FinishedGood.create({
        businessId: order.businessId,
        productionOrderId: new Types.ObjectId(id),
        productionBatchId: batch?._id,
        productName: order.productName,
        productSku: order.productSku,
        quantity: producedQuantity,
        unit: order.unit,
        batchNumber: batch?.batchNumber,
        producedAt: now,
        qualityChecked,
        qualityNotes: qualityNotes || undefined,
        notes: notes || undefined,
      });
    }

    // Update consumed quantities on items — fetch each item and mark as fully consumed
    const items = await ProductionOrderItem.find({
      productionOrderId: new Types.ObjectId(id),
    }).lean();
    await Promise.all(
      items.map((item: any) =>
        ProductionOrderItem.findByIdAndUpdate(item._id, {
          $set: { consumedQuantity: item.requiredQuantity || 0 },
        })
      )
    );

    return NextResponse.json({
      success: true,
      data: { order: updatedOrder, batch, finishedGood },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
