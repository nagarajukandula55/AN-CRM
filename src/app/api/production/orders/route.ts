import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import ProductionOrder from "@/models/ProductionOrder";
import ProductionOrderItem from "@/models/ProductionOrderItem";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/**
 * REMOVED: a local getNextOrderNumber() used to live here — an EIGHTH
 * previously-undiscovered duplicate number generator, and one of the
 * riskiest: it found the globally-last ProductionOrder (`findOne({}, ...)`
 * — no businessId filter at all, so every business on the platform shared
 * ONE counter), matched a "PO-" prefix via regex (colliding visually with
 * Purchase Orders' own "PO-" prefix, a separate document type entirely),
 * and derived the next number via find-highest-then-increment, a race
 * condition under concurrent requests. Replaced with the canonical
 * core/numbering/numberingService.ts, scoped per-business and using
 * PRODUCTION_ORDER's own configured/default prefix ("MFG" by default —
 * see core/numbering/types.ts's DEFAULT_PREFIXES) instead of colliding
 * with Purchase Order's "PO-".
 */

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("production", "view"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }
    const h = await headers();
    const userId = h.get("x-user-id");

    await connectDB();

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!businessId) {
      return NextResponse.json(
        { error: "businessId is required" },
        { status: 400 }
      );
    }

    const query: Record<string, unknown> = {
      businessId: new Types.ObjectId(businessId),
      isDeleted: false,
    };
    if (status) query.status = status;
    if (priority) query.priority = priority;

    const [orders, total] = await Promise.all([
      ProductionOrder.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ProductionOrder.countDocuments(query),
    ]);

    // Summary counts
    const [draftCount, plannedCount, inProgressCount, completedCount] =
      await Promise.all([
        ProductionOrder.countDocuments({
          businessId: new Types.ObjectId(businessId),
          status: "DRAFT",
          isDeleted: false,
        }),
        ProductionOrder.countDocuments({
          businessId: new Types.ObjectId(businessId),
          status: "PLANNED",
          isDeleted: false,
        }),
        ProductionOrder.countDocuments({
          businessId: new Types.ObjectId(businessId),
          status: "IN_PROGRESS",
          isDeleted: false,
        }),
        ProductionOrder.countDocuments({
          businessId: new Types.ObjectId(businessId),
          status: "COMPLETED",
          isDeleted: false,
        }),
      ]);

    return NextResponse.json({
      success: true,
      data: orders,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      summary: { draftCount, plannedCount, inProgressCount, completedCount },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("production", "create"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }
    const h = await headers();
    const userId = h.get("x-user-id");

    await connectDB();

    const body = await req.json();
    const {
      businessId,
      bomId,
      productName,
      productSku,
      plannedQuantity,
      unit,
      priority,
      plannedStartDate,
      plannedEndDate,
      notes,
      items = [],
    } = body;

    if (!businessId || !productName || !plannedQuantity) {
      return NextResponse.json(
        { error: "businessId, productName, and plannedQuantity are required" },
        { status: 400 }
      );
    }

    const { value: orderNumber } = await generateDocumentNumber(businessId, "PRODUCTION_ORDER");

    const order = await ProductionOrder.create({
      orderNumber,
      businessId: new Types.ObjectId(businessId),
      bomId: bomId ? new Types.ObjectId(bomId) : undefined,
      productName,
      productSku,
      plannedQuantity,
      unit: unit || "pcs",
      priority: priority || "NORMAL",
      plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : undefined,
      plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : undefined,
      notes,
      createdBy: userId,
      status: "DRAFT",
    });

    // Create order items if provided
    let createdItems: unknown[] = [];
    if (items.length > 0) {
      const itemDocs = items.map((item: Record<string, unknown>) => ({
        productionOrderId: order._id,
        businessId: new Types.ObjectId(businessId),
        materialId: item.materialId
          ? new Types.ObjectId(item.materialId as string)
          : undefined,
        materialName: item.materialName,
        materialSku: item.materialSku,
        requiredQuantity: item.requiredQuantity,
        unit: item.unit || "pcs",
        unitCost: item.unitCost || 0,
        totalCost:
          ((item.requiredQuantity as number) || 0) *
          ((item.unitCost as number) || 0),
        notes: item.notes,
      }));
      createdItems = await ProductionOrderItem.insertMany(itemDocs);
    }

    logAction({
      action: "CREATE",
      entity: "ProductionOrder",
      entityId: order._id?.toString(),
      after: order,
      req,
      actor: { id: userId, businessId },
    });

    return NextResponse.json(
      { success: true, data: order, items: createdItems },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
