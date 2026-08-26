import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import InventoryMovement from "@/models/InventoryMovement";
import InventoryItem from "@/models/InventoryItem";
import Material from "@/models/Material";
import { logAction } from "@/lib/audit/logAction";
import { resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";

/* =========================================================
 * GET INVENTORY MOVEMENTS (LEDGER)
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    requirePermission(session as any, buildPermissionCode("inventory", "view"));

    const { searchParams } = new URL(req.url);
    // SECURITY: this route previously required session.business directly --
    // a vendor Owner has no BusinessMember row (that's what distinguishes
    // Owner from Staff), so it hard-403'd every vendor Owner outright, and
    // separately never scoped by vendorId at all, meaning any vendor who
    // DID have a business context saw every other vendor's stock ledger
    // too. resolveAuthorizedVendorScope covers both.
    const scope = await resolveAuthorizedVendorScope(
      session.user.id,
      searchParams.get("businessId"),
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    if (!scope?.businessId) {
      return NextResponse.json({ error: "Unauthorized or missing business context" }, { status: 401 });
    }

    const materialId = searchParams.get("materialId");
    const warehouseId = searchParams.get("warehouseId");

    const query: any = { businessId: new Types.ObjectId(scope.businessId) };
    if (scope.vendorId) query.vendorId = new Types.ObjectId(scope.vendorId);
    if (materialId) query.materialId = new Types.ObjectId(materialId);
    if (warehouseId) query.warehouseId = new Types.ObjectId(warehouseId);

    const movements = await InventoryMovement.find(query).sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: movements });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
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
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    requirePermission(session as any, buildPermissionCode("inventory", "edit"));

    const body = await req.json();
    const {
      materialId,
      warehouseId,
      type, // IN | OUT | ADJUSTMENT -- this route's own request shape, mapped below
      quantity,
      referenceId,
      referenceType,
      notes,
    } = body;

    if (!materialId || !warehouseId || !type || quantity === undefined || quantity === null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const scope = await resolveAuthorizedVendorScope(
      session.user.id,
      body.businessId,
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    if (!scope?.businessId) {
      return NextResponse.json({ error: "Unauthorized or missing business context" }, { status: 401 });
    }
    const businessId = scope.businessId;
    const vendorId = scope.vendorId ? new Types.ObjectId(scope.vendorId) : null;

    const material = await Material.findById(materialId).select("materialName sku unit").lean<any>();

    const qty = Number(quantity);
    const delta = type === "IN" ? qty : type === "OUT" ? -qty : qty; // ADJUSTMENT sets absolute, handled below

    // STEP 1: find/create the running stock record FIRST -- InventoryMovement
    // (InventoryTransaction schema) requires itemType/transactionType/a
    // runningQuantity snapshot, none of which this route ever set before,
    // so every write here previously failed schema validation outright.
    let item = await InventoryItem.findOne({
      businessId: new Types.ObjectId(businessId),
      materialId: new Types.ObjectId(materialId),
      warehouseId: new Types.ObjectId(warehouseId),
      active: true,
    });

    const previousQty = item?.onHandQuantity || 0;
    const newQty = type === "ADJUSTMENT" ? qty : previousQty + delta;

    if (item) {
      item.onHandQuantity = newQty;
      item.availableQuantity = Math.max(0, newQty - (item.reservedQuantity || 0));
      item.lastTransactionDate = new Date();
      item.lastTransactionType = type === "ADJUSTMENT" ? "ADJUSTMENT" : type === "IN" ? "PURCHASE" : "SALE";
      await item.save();
    } else {
      item = await InventoryItem.create({
        businessId: new Types.ObjectId(businessId),
        vendorId,
        warehouseId: new Types.ObjectId(warehouseId),
        itemType: "MATERIAL",
        materialId: new Types.ObjectId(materialId),
        itemName: material?.materialName,
        sku: material?.sku,
        unit: material?.unit || "pcs",
        onHandQuantity: newQty,
        availableQuantity: Math.max(0, newQty),
        lastTransactionDate: new Date(),
        lastTransactionType: type === "ADJUSTMENT" ? "ADJUSTMENT" : type === "IN" ? "PURCHASE" : "SALE",
      });
    }

    // STEP 2: ledger entry, matching InventoryTransaction's real schema.
    const movement = await InventoryMovement.create({
      businessId: new Types.ObjectId(businessId),
      vendorId,
      warehouseId: new Types.ObjectId(warehouseId),
      itemType: "MATERIAL",
      materialId: new Types.ObjectId(materialId),
      itemName: material?.materialName,
      sku: material?.sku,
      unit: material?.unit,
      transactionType: type === "ADJUSTMENT" ? "ADJUSTMENT" : type === "IN" ? "PURCHASE" : "SALE",
      quantity: type === "ADJUSTMENT" ? newQty - previousQty : delta,
      runningQuantity: newQty,
      movementReason: type === "ADJUSTMENT" ? "ADJUSTMENT" : undefined,
      referenceType: referenceType || "ADJUSTMENT",
      referenceId: referenceId && Types.ObjectId.isValid(referenceId) ? new Types.ObjectId(referenceId) : undefined,
      remarks: notes,
      createdBy: session.user.id,
    });

    logAction({
      action: "CREATE",
      entity: "InventoryMovement",
      entityId: movement._id?.toString(),
      after: movement,
      req,
      actor: { id: session.user.id, businessId },
    });

    return NextResponse.json({ success: true, data: movement });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
