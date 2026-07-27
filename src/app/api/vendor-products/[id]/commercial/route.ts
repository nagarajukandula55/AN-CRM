import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProduct from "@/models/VendorProduct";
import VendorProductBOM from "@/models/VendorProductBOM";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function GET(
  req: Request,
  context: any
) {
  try {
    await connectDB();

    const { id } = await context.params;

    const data = await VendorProductBOM.find({
      vendorProductId: id,
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err.message,
      },
      { status: 500 }
    );
  }
}

// PATCH — persist StepCommercial's form (vendorSku, vendorCost, shipping,
// MOQ, lead time, available stock, mrp, suggestedSellingPrice). This handler
// was previously missing entirely, so the wizard's "Commercial Details" step
// silently discarded every field the vendor typed (the fetch() in
// StepCommercial.tsx never checked res.ok, so the 405 went unnoticed).
export async function PATCH(
  request: Request,
  context: any
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("vendor_products", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const { id } = await context.params;
    const body = await request.json();

    const allowed = [
      "vendorSku",
      "vendorCost",
      "vendorShippingCost",
      "shippingCostType",
      "minimumOrderQty",
      "leadTimeDays",
      "availableStock",
      "mrp",
      "suggestedSellingPrice",
      "manufacturingCost",
      "packingCost",
      "logisticsOverhead",
      "pricingTiers",
      "returnsProvisionPercent",
    ];

    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key];
    }

    const updated = await VendorProduct.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, message: "Vendor Product not found" },
        { status: 404 }
      );
    }

    logAction({
      action: "UPDATE",
      entity: "VendorProduct",
      entityId: id,
      after: updated,
      req: request,
      actor: { businessId: updated.businessId?.toString() },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
