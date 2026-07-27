import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import InventoryItem from "@/models/InventoryItem";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import { notify } from "@/lib/notify";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * GET INVENTORY ITEMS
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const session = userId
      ? { user: { id: userId, name: h.get("x-user-name") || "", email: h.get("x-user-email") || "" }, permissions: [], roles: [] }
      : null;

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    requirePermission(session, buildPermissionCode("inventory", "view"));

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");

    if (!businessId) {
      return NextResponse.json(
        { error: "businessId is required" },
        { status: 400 }
      );
    }

    const items = await InventoryItem.find({
      businessId: new Types.ObjectId(businessId),
      isDeleted: false,
    }).sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      data: items,
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
 * CREATE INVENTORY ITEM
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const session = userId
      ? { user: { id: userId, name: h.get("x-user-name") || "", email: h.get("x-user-email") || "" }, permissions: [], roles: [] }
      : null;

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    requirePermission(session, buildPermissionCode("inventory", "edit"));

    const body = await req.json();

    const {
      businessId,
      materialId,
      warehouseId,
      quantity,
      unit,
    } = body;

    if (!businessId || !materialId || !warehouseId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const item = await InventoryItem.create({
      businessId: new Types.ObjectId(businessId),
      materialId: new Types.ObjectId(materialId),
      warehouseId: new Types.ObjectId(warehouseId),
      quantity: quantity || 0,
      unit,
      createdBy: session.user.id,
    });

    // Fire notification (non-blocking)
    notify({
      event: 'NEW_PRODUCT',
      message: `📦 New inventory item added.\nMaterial ID: ${materialId}\nWarehouse: ${warehouseId}\nQty: ${quantity || 0} ${unit || ''}`.trim(),
    }).catch(() => {});

    logAction({
      action: "CREATE",
      entity: "InventoryItem",
      entityId: item._id?.toString(),
      after: item,
      req,
      actor: { id: session.user.id, businessId },
    });

    return NextResponse.json({
      success: true,
      data: item,
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
