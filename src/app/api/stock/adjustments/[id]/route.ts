import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import StockAdjustment from "@/models/StockAdjustment";
import InventoryItem from "@/models/InventoryItem";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// GET /api/stock/adjustments/[id] — single-record fetch, added for the
// print page (core/documentTemplates adapter needs one record, not a page
// of a list). Populates the adjusted inventory item's material/variant so
// the print can show a real item name instead of just an id.
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid adjustment id" }, { status: 400 });
    }

    const adjustment = await StockAdjustment.findById(id)
      .populate({ path: "inventoryItemId", populate: [{ path: "materialId" }, { path: "productVariantId" }] })
      .lean();

    if (!adjustment) {
      return NextResponse.json({ error: "Adjustment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: adjustment });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
