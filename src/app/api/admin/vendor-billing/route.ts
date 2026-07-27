import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import VendorSubscription from "@/models/VendorSubscription";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { computeStatus, totalAmount } from "@/core/billing/billing.service";

/**
 * GET /api/admin/vendor-billing — every vendor across every business, with
 * its current plan/status, for the Super Admin's cross-business billing
 * overview. Super Admin only — pricing is not a per-business-admin concern.
 */
export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();
    const [vendors, subs, businesses] = await Promise.all([
      VendorProfile.find({ isDeleted: { $ne: true } }).select("vendorId companyName businessId status").lean(),
      VendorSubscription.find().lean(),
      Business.find().select("name").lean(),
    ]);

    const subByVendor = new Map(subs.map((s: any) => [String(s.vendorId), s]));
    const nameByBusiness = new Map(businesses.map((b: any) => [String(b._id), b.name]));

    const rows = vendors.map((v: any) => {
      const sub = subByVendor.get(String(v._id)) || null;
      return {
        vendorId: v._id,
        vendorCode: v.vendorId,
        companyName: v.companyName,
        businessId: v.businessId,
        businessName: v.businessId ? nameByBusiness.get(String(v.businessId)) || "" : "",
        status: computeStatus(sub),
        amount: sub ? totalAmount(sub.modules) : 0,
        validityDays: sub?.validityDays ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      };
    });

    return NextResponse.json({ success: true, vendors: rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
