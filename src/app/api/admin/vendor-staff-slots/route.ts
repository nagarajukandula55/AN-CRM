import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorStaffSlot from "@/models/VendorStaffSlot";

/** GET /api/admin/vendor-staff-slots?vendorId= — every designation seat
 * (filled or not) for a vendor, so an admin can see who's missing. */
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    if (!h.get("x-user-id")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const vendorId = req.nextUrl.searchParams.get("vendorId");
    if (!vendorId) {
      return NextResponse.json({ success: false, error: "vendorId is required" }, { status: 400 });
    }
    const slots = await VendorStaffSlot.find({ vendorId })
      .populate("userId", "name email username")
      .sort({ designation: 1 })
      .lean();
    return NextResponse.json({ success: true, slots });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
