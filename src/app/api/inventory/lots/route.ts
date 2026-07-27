import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import InventoryLot from "@/models/InventoryLot";
import { logAction } from "@/lib/audit/logAction";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Material";
import "@/models/VendorProfile";

/* =========================================================
 * GET /api/inventory/lots
 * Query params:
 *   businessId (required)
 *   itemId     (optional) — filter to a specific inventory item
 *   status     (optional) — filter by lot status
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const itemId = searchParams.get("itemId");
    const status = searchParams.get("status");

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "businessId is required" },
        { status: 400 }
      );
    }

    const filter: Record<string, unknown> = {
      businessId: new Types.ObjectId(businessId),
    };

    if (itemId) {
      filter.itemId = new Types.ObjectId(itemId);
    }

    if (status) {
      filter.status = status;
    }

    const lots = await InventoryLot.find(filter)
      .sort({ createdAt: -1 })
      .populate("itemId", "name sku unit")
      .populate("supplierId", "name contactPerson");

    return NextResponse.json({ success: true, data: lots });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/* =========================================================
 * POST /api/inventory/lots
 * Body:
 *   businessId       (required)
 *   itemId           (required)
 *   lotNumber        (required)
 *   quantity         (required)
 *   unitCost         (required)
 *   batchNumber?
 *   manufacturedDate?
 *   expiryDate?
 *   receivedDate?
 *   supplierId?
 *   grnId?
 *   notes?
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      businessId,
      itemId,
      lotNumber,
      quantity,
      unitCost,
      batchNumber,
      manufacturedDate,
      expiryDate,
      receivedDate,
      supplierId,
      grnId,
      notes,
    } = body;

    if (!businessId || !itemId || !lotNumber || quantity == null || unitCost == null) {
      return NextResponse.json(
        {
          success: false,
          error: "businessId, itemId, lotNumber, quantity, and unitCost are required",
        },
        { status: 400 }
      );
    }

    const qty = Number(quantity);
    const cost = Number(unitCost);

    if (isNaN(qty) || qty < 0) {
      return NextResponse.json(
        { success: false, error: "quantity must be a non-negative number" },
        { status: 400 }
      );
    }

    if (isNaN(cost) || cost < 0) {
      return NextResponse.json(
        { success: false, error: "unitCost must be a non-negative number" },
        { status: 400 }
      );
    }

    const lot = await InventoryLot.create({
      businessId: new Types.ObjectId(businessId),
      itemId: new Types.ObjectId(itemId),
      lotNumber: lotNumber.toString().trim(),
      batchNumber: batchNumber?.toString().trim(),
      quantity: qty,
      remainingQuantity: qty,
      unitCost: cost,
      totalCost: qty * cost,
      manufacturedDate: manufacturedDate ? new Date(manufacturedDate) : undefined,
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
      supplierId: supplierId ? new Types.ObjectId(supplierId) : undefined,
      grnId: grnId ? new Types.ObjectId(grnId) : undefined,
      notes,
      createdBy: userId,
      status: "ACTIVE",
    });

    logAction({
      action: "CREATE",
      entity: "InventoryLot",
      entityId: lot._id?.toString(),
      after: lot,
      req,
      actor: { id: userId, businessId },
    });

    return NextResponse.json({ success: true, data: lot }, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    // Duplicate lot number for this business
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json(
        { success: false, error: "A lot with this lot number already exists for this business" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
