import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getProductCostAndTiers } from "@/core/pricing/productCost";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  { params }: RouteContext
) {
  try {
    await connectDB();

    const { id } = await params;
    const qty = Number(new URL(request.url).searchParams.get("qty") || 1);

    const result = await getProductCostAndTiers(id, { qty });
    if (!result) {
      return NextResponse.json(
        {
          success: false,
          message: "Vendor Product not found",
        },
        { status: 404 }
      );
    }
    const { cost, tiers } = result;

    const totalBaseCost =
      cost.materialCost +
      cost.wastageCost +
      cost.vendorCost +
      cost.manufacturingCost +
      cost.packingCost +
      cost.returnsProvisionCost +
      cost.shippingCost +
      cost.logisticsOverhead;

    // Default margin (later this will come from vendor/business agreement)
    const marginPercent = 25;

    const marginAmount =
      (totalBaseCost * marginPercent) / 100;

    const sellingPrice =
      totalBaseCost + marginAmount;

    return NextResponse.json({
      success: true,
      data: {
        materialCost: cost.materialCost,
        wastageCost: cost.wastageCost,
        vendorCost: cost.vendorCost,
        shippingCost: cost.shippingCost,
        manufacturingCost: cost.manufacturingCost,
        packingCost: cost.packingCost,
        logisticsOverhead: cost.logisticsOverhead,
        returnsProvisionCost: cost.returnsProvisionCost,
        totalBaseCost,
        marginPercent,
        marginAmount,
        sellingPrice,
        channelTiers: tiers,
      },
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
