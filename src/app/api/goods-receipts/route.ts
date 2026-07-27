import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { createGoodsReceipt, listGoodsReceiptsByBusiness } from "@/services/goodsReceipt.service";
import { logAction } from "@/lib/audit/logAction";

// GET /api/goods-receipts?businessId=&page=&limit=
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("grn", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    // Vendor-scoped callers (see app/vendor/grn) pass their own vendorId to
    // see only their own receipts, not the whole business's.
    const vendorId = searchParams.get("vendorId") || undefined;

    const result = await listGoodsReceiptsByBusiness(businessId, {
      page: Number(searchParams.get("page")) || 1,
      limit: Number(searchParams.get("limit")) || 25,
      vendorId,
    });

    return NextResponse.json({ success: true, data: result.items, pagination: result });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/goods-receipts — record receipt of goods against an approved PO.
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("grn", "create"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const body = await req.json();
    const { businessId, purchaseOrderId, lines, invoiceNumber, invoiceDate, remarks } = body;

    if (!businessId || !purchaseOrderId) {
      return NextResponse.json({ success: false, message: "businessId and purchaseOrderId are required" }, { status: 400 });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ success: false, message: "At least one line item is required" }, { status: 400 });
    }

    const goodsReceipt = await createGoodsReceipt({
      businessId,
      purchaseOrderId,
      lines,
      invoiceNumber,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      remarks,
      createdBy: session.user.id,
    });

    logAction({
      action: "CREATE",
      entity: "GoodsReceipt",
      entityId: goodsReceipt._id.toString(),
      after: goodsReceipt,
      req,
      actor: { id: session.user.id, businessId },
    });

    return NextResponse.json({ success: true, data: goodsReceipt }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || "Internal Server Error" }, { status: 500 });
  }
}
