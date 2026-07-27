import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

import VendorCatalog from "@/models/VendorCatalog";
// Required for .populate("vendorId") below -- see the identical fix/comment
// in api/admin/vendor-settlements/route.ts.
import "@/models/VendorProfile";

export async function GET(
  req: Request,
  context: any
) {
  try {
    await connectDB();

    const vendors =
      await VendorCatalog.find({
        variantId:
          (await context.params).variantId,

        active: true,

        status: "ACTIVE",
      })
        .populate("vendorId")
        .sort({
          preferredVendor: -1,
          priority: 1,
          vendorCost: 1,
        });

    return NextResponse.json({
      success: true,
      data: vendors,
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
