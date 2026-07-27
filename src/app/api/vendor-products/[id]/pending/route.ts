import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProduct from "@/models/VendorProduct";
// Required for .populate("vendorId") below -- see the identical fix/comment
// in api/admin/vendor-settlements/route.ts.
import "@/models/VendorProfile";

export async function GET() {
  try {
    await connectDB();

    const pending =
      await VendorProduct.find({
        approvalStatus: "PENDING",
      })
        .populate("vendorId")
        .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      data: pending,
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
