import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import InventoryMovement from "@/models/InventoryMovement";
import InventoryItem from "@/models/InventoryItem";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * GET INVENTORY MOVEMENTS (LEDGER)
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();

    if (!session?.user || !session.business) {
      return NextResponse.json(
        { error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("inventory", "view"));

    const { searchParams } = new URL(req.url);

    const materialId = searchParams.get("materialId");
    const warehouseId = searchParams.get("warehouseId");

    const query: any = {
      businessId: new Types.ObjectId(session.business.businessId),
    };

    if (materialId) {
      query.materialId = new Types.ObjectId(materialId);
    }

    if (warehouseId) {
      query.warehouseId = new Types.ObjectId(warehouseId);
    }

    const movements = await InventoryMovement.find(query).sort({
      createdAt: -1,
    });

    return NextResponse.json({
      success: true,
      data: movements,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
 * CREATE INVENTORY MOVEMENT (STOCK LEDGER ENTRY)
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();

    if (!session?.user || !session.business) {
      return NextResponse.json(
        { error: "Unauthorized or missing business context" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("inventory", "edit"));

    const body = await req.json();

    const {
      materialId,
      warehouseId,
      type, // IN | OUT | ADJUSTMENT
      quantity,
      referenceId,
      referenceType,
      notes,
    } = body;

    if (!materialId || !warehouseId || !type || !quantity) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const businessId = session.business.businessId;

    /**
     * STEP 1: Create movement entry (ledger)
     */
    const movement = await InventoryMovement.create({
      businessId: new Types.ObjectId(businessId),
      materialId: new Types.ObjectId(materialId),
      warehouseId: new Types.ObjectId(warehouseId),
      type,
      quantity,
      referenceId,
      referenceType,
      notes,
      createdBy: session.user.id,
    });

    /**
     * STEP 2: Update stock balance
     */
    const item = await InventoryItem.findOne({
      businessId: new Types.ObjectId(businessId),
      materialId: new Types.ObjectId(materialId),
      warehouseId: new Types.ObjectId(warehouseId),
    });

    if (item) {
      if (type === "IN") {
        item.quantity += quantity;
      } else if (type === "OUT") {
        item.quantity -= quantity;
      } else if (type === "ADJUSTMENT") {
        item.quantity = quantity;
      }

      await item.save();
    } else {
      await InventoryItem.create({
        businessId: new Types.ObjectId(businessId),
        materialId: new Types.ObjectId(materialId),
        warehouseId: new Types.ObjectId(warehouseId),
        quantity:
          type === "IN"
            ? quantity
            : type === "OUT"
            ? -quantity
            : quantity,
        createdBy: session.user.id,
      });
    }

    logAction({
      action: "CREATE",
      entity: "InventoryMovement",
      entityId: movement._id?.toString(),
      after: movement,
      req,
      actor: { id: session.user.id, businessId },
    });

    return NextResponse.json({
      success: true,
      data: movement,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
