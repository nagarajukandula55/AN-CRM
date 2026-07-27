import { NextRequest, NextResponse } from "next/server";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import PurchaseOrder from "@/models/PurchaseOrder";
import { Types } from "mongoose";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * GET PURCHASE ORDERS (SECURE MULTI-TENANT)
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

    requirePermission(session as any, buildPermissionCode("purchase", "view"));

    const orders = await PurchaseOrder.find({
      businessId: new Types.ObjectId(session.business.businessId),
      isDeleted: false,
    }).sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      data: orders,
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
 * CREATE PURCHASE ORDER (SECURE MULTI-TENANT)
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

    requirePermission(session as any, buildPermissionCode("purchase", "create"));

    const body = await req.json();

    const { vendorId, items, expectedDate } = body;

    if (!vendorId || !items?.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const order = await PurchaseOrder.create({
      businessId: new Types.ObjectId(session.business.businessId),
      vendorId: new Types.ObjectId(vendorId),
      items,
      expectedDate,
      status: "DRAFT",
      createdBy: session.user.id,
    });

    logAction({
      action: "CREATE",
      entity: "PurchaseOrder",
      entityId: order?._id?.toString(),
      after: order,
      req,
      actor: { businessId: session.business.businessId?.toString() },
    });

    return NextResponse.json({
      success: true,
      data: order,
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
