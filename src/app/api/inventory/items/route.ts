import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import InventoryItem from "@/models/InventoryItem";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import { notify } from "@/lib/notify";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";
import { vendorHasModule } from "@/core/access/vendorAccess.service";

/* =========================================================
 * GET INVENTORY ITEMS
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    // SECURITY: this route built its own ad-hoc pseudo-session (always
    // permissions: []) instead of using getEnrichedSession(), and trusted
    // businessId straight from the query param with no ownership check.
    const session = await getEnrichedSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("inventory", "view"));

    const { searchParams } = new URL(req.url);
    const scope = await resolveAuthorizedVendorScope(
      session.user.id,
      searchParams.get("businessId"),
      session.isSuperAdmin,
      session.business?.businessId || null
    );

    if (!scope?.businessId) {
      return NextResponse.json(
        { error: "businessId is required" },
        { status: 400 }
      );
    }

    // Every onboarded vendor shares ONE platform Business -- filtering by
    // businessId alone returned every vendor's stock to every other vendor
    // sharing it. InventoryItem.vendorId (null = business-level/shared
    // stock) already existed on the schema but nothing here ever filtered
    // by it.
    // The schema's actual soft-state field is `active` (see models/
    // Inventory.js) -- this route previously filtered on `isDeleted`,
    // a field that doesn't exist on this schema at all, which silently
    // matched nothing (Mongo's `{isDeleted: false}` doesn't match documents
    // where the field is simply absent) and made this route return an
    // empty list for every request.
    const filter: Record<string, unknown> = {
      businessId: new Types.ObjectId(scope.businessId),
      active: true,
    };
    if (scope.vendorId) filter.vendorId = new Types.ObjectId(scope.vendorId);

    const items = await InventoryItem.find(filter).sort({ createdAt: -1 });

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
    const session = await getEnrichedSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    requirePermission(session as any, buildPermissionCode("inventory", "edit"));

    const body = await req.json();

    const {
      materialId,
      warehouseId,
      quantity,
      unit,
    } = body;

    // SECURITY: body.businessId used to be trusted directly.
    const scope = await resolveAuthorizedVendorScope(
      session.user.id,
      body.businessId,
      session.isSuperAdmin,
      session.business?.businessId || null
    );

    if (!scope?.businessId || !materialId || !warehouseId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Inventory tracking is Pro+ only -- Starter had this stripped per
    // explicit direction ("no inventory at all").
    if (scope.vendorId && !(await vendorHasModule(scope.businessId, scope.vendorId, "inventory"))) {
      return NextResponse.json(
        { error: "Inventory tracking is available on the Pro plan and above." },
        { status: 403 }
      );
    }

    const item = await InventoryItem.create({
      businessId: new Types.ObjectId(scope.businessId),
      vendorId: scope.vendorId ? new Types.ObjectId(scope.vendorId) : null,
      materialId: new Types.ObjectId(materialId),
      warehouseId: new Types.ObjectId(warehouseId),
      itemType: "MATERIAL",
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
      actor: { id: session.user.id, businessId: scope.businessId },
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
