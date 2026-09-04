import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

// GET /api/vendor/referrals — this vendor's own referral code (their
// vendorId, e.g. "VND0002" -- already unique/human-readable, doubles as
// the referral code, see api/vendors/apply/route.ts's referredByCode
// handling) plus everyone who signed up using it.
export async function GET(_req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const ctx = await resolveVendorContext(userId, { allowExpiredForRead: true });
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });

    const vendor = ctx.vendor as any;
    const referred = vendor.vendorId
      ? await VendorProfile.find({ referredByCode: vendor.vendorId, isDeleted: { $ne: true } })
          .select("companyName createdAt status")
          .sort({ createdAt: -1 })
          .lean()
      : [];

    return NextResponse.json({
      success: true,
      referralCode: vendor.vendorId || null,
      referred,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
