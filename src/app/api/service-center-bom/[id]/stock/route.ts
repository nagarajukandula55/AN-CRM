/**
 * GET /api/service-center-bom/[id]/stock?warehouseId=... — real Inventory
 * stock check for a BOM part, only meaningful when the part has a linked
 * materialId (see ServiceCenterBOM.materialId) and the business has
 * Business.inventorySerialized = true. Used by the workorder repair flow
 * to warn before adding a part with insufficient stock -- the close route
 * re-checks and actually deducts, this endpoint is read-only/advisory.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import ServiceCenterBOM from "@/models/ServiceCenterBOM";
import Inventory from "@/models/Inventory";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get("warehouseId");

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid part id" }, { status: 400 });
    }

    await connectDB();

    const part = await ServiceCenterBOM.findById(id).select("materialId").lean();
    if (!part) {
      return NextResponse.json({ success: false, error: "Part not found" }, { status: 404 });
    }
    const materialId = (part as any).materialId;
    if (!materialId) {
      // No stock tracking configured for this part -- treat as always
      // available (same as the non-serialized default behaviour).
      return NextResponse.json({ success: true, tracked: false, availableQuantity: null });
    }
    if (!warehouseId || !mongoose.Types.ObjectId.isValid(warehouseId)) {
      return NextResponse.json({ success: false, error: "warehouseId is required for a stock-tracked part" }, { status: 400 });
    }

    const inventory = await Inventory.findOne({ warehouseId, materialId, active: true })
      .select("availableQuantity")
      .lean();

    return NextResponse.json({
      success: true,
      tracked: true,
      availableQuantity: (inventory as any)?.availableQuantity ?? 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
