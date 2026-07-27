import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Material from "@/models/Material";
import MaterialPriceHistory from "@/models/MaterialPriceHistory";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

/**
 * PATCH /api/vendor/materials/:materialId — lets a vendor edit a material
 * they can see (scoped to their own business), including its price. Every
 * price change is also appended to MaterialPriceHistory (not overwritten)
 * so cost trends stay visible over time and across vendors, for later
 * pricing/AI analysis -- not just whatever the current value happens to be.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ materialId: string }> }) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { materialId } = await params;
    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const vendor = ctx.vendor as any;
    const material = await Material.findOne({ _id: materialId, businessId: vendor.businessId });
    if (!material) return NextResponse.json({ success: false, message: "Material not found" }, { status: 404 });

    const body = await req.json();
    if (body.materialName !== undefined) material.materialName = String(body.materialName).trim();
    if (body.materialType !== undefined) material.materialType = body.materialType;
    if (body.categoryId !== undefined) material.categoryId = body.categoryId;
    if (body.unit !== undefined) {
      const unit = String(body.unit).trim();
      material.purchaseUnit = unit;
      material.stockUnit = unit;
      material.consumptionUnit = unit;
    }
    // Optional by design -- see the POST route's comment on why HSN/GST
    // aren't required to log a material's cost.
    if (body.hsnCode !== undefined) material.hsnCode = String(body.hsnCode).trim() || undefined;
    if (body.gstRate !== undefined) material.gstRate = body.gstRate === "" || body.gstRate === null ? undefined : Number(body.gstRate);

    const priceChanged = body.currentPrice !== undefined && Number(body.currentPrice) !== material.currentPrice;
    if (body.currentPrice !== undefined) material.currentPrice = Number(body.currentPrice) || 0;

    await material.save();

    if (priceChanged && material.currentPrice > 0) {
      await MaterialPriceHistory.create({
        businessId: vendor.businessId,
        materialId: material._id,
        vendorId: vendor._id,
        price: material.currentPrice,
        priceUnit: material.stockUnit,
      });
    }

    return NextResponse.json({ success: true, data: material });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
