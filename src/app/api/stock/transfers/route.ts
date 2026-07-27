import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import StockTransfer from "@/models/StockTransfer";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * REMOVED: a local generateTransferNumber() used to live here — a SEVENTH
 * previously-undiscovered duplicate number generator (beyond the six
 * already flagged in PROGRESS.md), and one of the more fragile ones: it
 * found the "last" transfer number by regex-matching today's date prefix
 * and sorting transferNumber as a STRING (not numerically — "ST-...-0009"
 * sorts after "ST-...-0010" lexicographically once past 9999, and even
 * before that, string-sorted find-then-increment is a race condition under
 * concurrent requests), hardcoded the "ST-" prefix ignoring any admin
 * config, and queried StockTransfer globally rather than scoped to the
 * requesting business (so two different businesses' transfers could
 * collide on the same date-based counter). Replaced with the canonical
 * core/numbering/numberingService.ts, same as every other document type.
 */

// ---------------------------------------------------------------------------
// GET /api/stock/transfers?businessId=...&status=...&page=1&limit=20
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("stock_transfers", "view"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }
    const h = await headers();
    const userId = h.get("x-user-id");

    await connectDB();

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const status = searchParams.get("status");
    const fromWarehouse = searchParams.get("fromWarehouse");
    const toWarehouse = searchParams.get("toWarehouse");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10))
    );

    if (!businessId) {
      return NextResponse.json(
        { error: "businessId is required" },
        { status: 400 }
      );
    }

    if (!Types.ObjectId.isValid(businessId)) {
      return NextResponse.json(
        { error: "Invalid businessId" },
        { status: 400 }
      );
    }

    const filter: Record<string, unknown> = {
      businessId: new Types.ObjectId(businessId),
    };

    if (status) filter.status = status;
    if (fromWarehouse) filter.fromWarehouse = fromWarehouse;
    if (toWarehouse) filter.toWarehouse = toWarehouse;

    // Vendor-scoped view (see app/vendor/stock-transfers) -- StockTransfer
    // has no vendorId of its own (it's warehouse-to-warehouse), so scope by
    // "either side of the transfer is one of MY warehouses" instead, fed by
    // this vendor's own /api/vendor/warehouses list.
    const warehouseIn = searchParams.get("warehouseIn");
    if (warehouseIn) {
      const ids = warehouseIn.split(",").filter(Boolean);
      if (ids.length > 0) {
        filter.$or = [{ fromWarehouse: { $in: ids } }, { toWarehouse: { $in: ids } }];
      }
    }

    const [transfers, total] = await Promise.all([
      StockTransfer.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StockTransfer.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      data: transfers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/stock/transfers
// Body: { businessId, fromWarehouse, toWarehouse, items, notes?, status? }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("stock_transfers", "create"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }
    const h = await headers();
    const userId = h.get("x-user-id");

    await connectDB();

    const body = await req.json();
    const {
      businessId,
      fromWarehouse,
      toWarehouse,
      items,
      notes,
      status = "DRAFT",
      transferredAt,
    } = body;

    // --- Validate required fields ---
    if (!businessId || !Types.ObjectId.isValid(businessId)) {
      return NextResponse.json(
        { error: "Valid businessId is required" },
        { status: 400 }
      );
    }

    if (!fromWarehouse || typeof fromWarehouse !== "string") {
      return NextResponse.json(
        { error: "fromWarehouse is required" },
        { status: 400 }
      );
    }

    if (!toWarehouse || typeof toWarehouse !== "string") {
      return NextResponse.json(
        { error: "toWarehouse is required" },
        { status: 400 }
      );
    }

    if (fromWarehouse === toWarehouse) {
      return NextResponse.json(
        { error: "fromWarehouse and toWarehouse must be different" },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "At least one item is required" },
        { status: 400 }
      );
    }

    // Validate each line item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.itemId || !Types.ObjectId.isValid(item.itemId)) {
        return NextResponse.json(
          { error: `Item at index ${i}: valid itemId is required` },
          { status: 400 }
        );
      }
      if (!item.itemName || typeof item.itemName !== "string") {
        return NextResponse.json(
          { error: `Item at index ${i}: itemName is required` },
          { status: 400 }
        );
      }
      if (typeof item.quantity !== "number" || item.quantity <= 0) {
        return NextResponse.json(
          { error: `Item at index ${i}: quantity must be a positive number` },
          { status: 400 }
        );
      }
    }

    const validStatuses = ["DRAFT", "IN_TRANSIT", "COMPLETED", "CANCELLED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const { value: transferNumber } = await generateDocumentNumber(businessId, "STOCK_TRANSFER");

    const transfer = await StockTransfer.create({
      transferNumber,
      businessId: new Types.ObjectId(businessId),
      fromWarehouse: fromWarehouse.trim(),
      toWarehouse: toWarehouse.trim(),
      items: items.map((item: {
        itemId: string;
        itemName: string;
        sku?: string;
        quantity: number;
        unit?: string;
        unitCost?: number;
      }) => ({
        itemId: new Types.ObjectId(item.itemId),
        itemName: item.itemName,
        sku: item.sku,
        quantity: item.quantity,
        unit: item.unit ?? "pcs",
        unitCost: item.unitCost ?? 0,
      })),
      status,
      notes: notes ?? undefined,
      requestedBy: new Types.ObjectId(session.user.id),
      transferredAt: transferredAt ? new Date(transferredAt) : undefined,
      completedAt: status === "COMPLETED" ? new Date() : undefined,
    });

    logAction({
      action: "CREATE",
      entity: "StockTransfer",
      entityId: transfer._id?.toString(),
      after: transfer,
      req,
      actor: { id: userId, businessId },
    });

    return NextResponse.json(
      { success: true, data: transfer },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
