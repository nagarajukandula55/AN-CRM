import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import StockTransfer from "@/models/StockTransfer";
import { logAction } from "@/lib/audit/logAction";

// ---------------------------------------------------------------------------
// PATCH /api/stock/transfers/[id]
// Body: { status }
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid transfer ID" }, { status: 400 });
    }

    const body = await req.json();
    const { status } = body;

    const validStatuses = ["DRAFT", "IN_TRANSIT", "COMPLETED", "CANCELLED"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = { status };

    if (status === "IN_TRANSIT") {
      update.transferredAt = new Date();
    }
    if (status === "COMPLETED") {
      update.completedAt = new Date();
      update.approvedBy = new Types.ObjectId(userId);
    }

    const transfer = await StockTransfer.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    ).lean();

    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "StockTransfer",
      entityId: id,
      after: update,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, data: transfer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/stock/transfers/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid transfer ID" }, { status: 400 });
    }

    const transfer = await StockTransfer.findById(id).lean();

    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: transfer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
