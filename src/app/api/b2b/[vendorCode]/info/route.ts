import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";

// GET /api/b2b/:vendorCode/info — public. Resolves a vendor's short code
// (VendorProfile.vendorId, e.g. "NAT-VND-0001") to the info the B2B
// signup/login pages need, and confirms this vendor actually has the
// portal switched on (VendorProfile.enableB2BOrdering).
export async function GET(_req: Request, { params }: { params: Promise<{ vendorCode: string }> }) {
  try {
    const { vendorCode } = await params;
    await connectDB();

    const vendor = await VendorProfile.findOne({ vendorId: vendorCode }).select("vendorId companyName businessId enableB2BOrdering").lean();
    if (!vendor || !(vendor as any).enableB2BOrdering) {
      return NextResponse.json({ success: false, message: "B2B ordering isn't available for this vendor." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      vendor: { vendorId: (vendor as any).vendorId, companyName: (vendor as any).companyName },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
