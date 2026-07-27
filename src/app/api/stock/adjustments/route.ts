import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import StockAdjustment from "@/models/StockAdjustment";
import InventoryItem from "@/models/InventoryItem";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/* =========================================================
 * GET /api/stock/adjustments?businessId=&page=&limit=&inventoryItemId=
 * List adjustments for a business with optional item filter + pagination
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("stock_adjustments", "view"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json(
        { error: "businessId is required" },
        { status: 400 }
      );
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
    );
    const skip = (page - 1) * limit;

    const inventoryItemId = searchParams.get("inventoryItemId");

    const filter: Record<string, unknown> = {
      businessId: new Types.ObjectId(businessId),
    };
    if (inventoryItemId) {
      filter.inventoryItemId = new Types.ObjectId(inventoryItemId);
    }

    const [adjustments, total] = await Promise.all([
      StockAdjustment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StockAdjustment.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      data: adjustments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/* =========================================================
 * POST /api/stock/adjustments
 * Create a new adjustment and update the inventory item quantity
 *
 * Body:
 *   businessId      string (required)
 *   inventoryItemId string (required)
 *   adjustmentType  "ADD" | "REMOVE" | "SET"  (required)
 *   quantity        number (required) — amount to add/remove, or absolute value for SET
 *   reason          string (optional)
 *   notes           string (optional)
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("stock_adjustments", "create"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");

    const body = await req.json();
    const { businessId, inventoryItemId, adjustmentType, quantity, reason, notes } =
      body;

    if (!businessId || !inventoryItemId || !adjustmentType || quantity === undefined) {
      return NextResponse.json(
        { error: "businessId, inventoryItemId, adjustmentType, and quantity are required" },
        { status: 400 }
      );
    }

    if (!["ADD", "REMOVE", "SET"].includes(adjustmentType)) {
      return NextResponse.json(
        { error: "adjustmentType must be ADD, REMOVE, or SET" },
        { status: 400 }
      );
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty < 0) {
      return NextResponse.json(
        { error: "quantity must be a non-negative number" },
        { status: 400 }
      );
    }

    // Fetch the current inventory item
    const item = await InventoryItem.findOne({
      _id: new Types.ObjectId(inventoryItemId),
      businessId: new Types.ObjectId(businessId),
    });

    if (!item) {
      return NextResponse.json(
        { error: "Inventory item not found" },
        { status: 404 }
      );
    }

    // NOTE: the Inventory/InventoryItem schema (models/Inventory.js) has no
    // plain `quantity` field — this used to read `item.quantity`, which is
    // always undefined on the real schema, so previousQuantity was silently
    // defaulting to 0 on every adjustment regardless of actual stock level.
    // Fixed to read the real field, `availableQuantity`, which is what this
    // route's ADD/REMOVE/SET semantics were actually meant to operate on.
    const previousQuantity: number = item.availableQuantity ?? 0;
    let newQuantity: number;

    switch (adjustmentType) {
      case "ADD":
        newQuantity = previousQuantity + qty;
        break;
      case "REMOVE":
        newQuantity = Math.max(0, previousQuantity - qty);
        break;
      case "SET":
        newQuantity = qty;
        break;
      default:
        newQuantity = previousQuantity;
    }

    // Generate the adjustment's document number via the canonical numbering
    // engine. StockAdjustment previously had no number field at all — this
    // was the one document type flagged as a gap during the numbering
    // consolidation ("ensure whatever documents in the entire system that
    // numbering should be controlled") — now every adjustment gets one,
    // admin-configurable in Settings > Document Numbers like every other type.
    const { value: adjustmentNumber } = await generateDocumentNumber(businessId, "STOCK_ADJUSTMENT", { vendorId: "" });

    // Persist the adjustment record first
    const adjustment = await StockAdjustment.create({
      businessId: new Types.ObjectId(businessId),
      adjustmentNumber,
      inventoryItemId: new Types.ObjectId(inventoryItemId),
      adjustmentType,
      quantityAdjusted: qty,
      previousQuantity,
      newQuantity,
      reason: reason || undefined,
      notes: notes || undefined,
      adjustedBy: userId,
    });

    // Update the inventory item quantity (same field-name fix as above —
    // this used to write `quantity`, a field that doesn't exist on the real
    // schema, so the update silently created a stray unused key and never
    // actually changed stock levels).
    await InventoryItem.findByIdAndUpdate(
      new Types.ObjectId(inventoryItemId),
      { $set: { availableQuantity: newQuantity } }
    );

    logAction({
      action: "CREATE",
      entity: "StockAdjustment",
      entityId: adjustment._id?.toString(),
      after: adjustment,
      req,
      actor: { id: userId, businessId },
    });

    return NextResponse.json(
      {
        success: true,
        data: adjustment,
        previousQuantity,
        newQuantity,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
