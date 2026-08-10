import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import StockTransfer from "@/models/StockTransfer";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

// SECURITY: both handlers below looked a transfer up by its Mongo _id
// ONLY -- no check that its businessId belongs to the caller, and no
// permission check at all beyond "some session exists". Any authenticated
// user could read, or even change the status of (PATCH), another
// business's stock transfer just by knowing/guessing its id.
async function assertOwnsTransfer(transfer: { businessId: unknown } | null, userId: string, isSuperAdmin: boolean, sessionBusinessId: string | null) {
  if (!transfer) return false;
  if (isSuperAdmin) return true;
  const authorizedBusinessId = await resolveAuthorizedBusinessId(userId, String(transfer.businessId), isSuperAdmin, sessionBusinessId);
  return authorizedBusinessId === String(transfer.businessId);
}

// ---------------------------------------------------------------------------
// PATCH /api/stock/transfers/[id]
// Body: { status }
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    await connectDB();

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid transfer ID" }, { status: 400 });
    }

    const existing = await StockTransfer.findById(id).lean();
    if (!existing || !(await assertOwnsTransfer(existing as any, userId, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
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
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid transfer ID" }, { status: 400 });
    }

    const transfer = await StockTransfer.findById(id).lean();

    if (!transfer || !(await assertOwnsTransfer(transfer as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: transfer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
