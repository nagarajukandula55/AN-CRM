import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import VendorProfile from "@/models/VendorProfile";
import Business from "@/models/Business";

/**
 * GET /api/vendor-subscriptions — admin-only list of every vendor
 * subscription (subVendorOf set), i.e. the trial/paid rows created by
 * services/vendorActivation.service.ts's activateVendorWithTrial (or any
 * future paid vendor plan). Joined with the vendor's company name/email
 * and the business's name for display -- see
 * src/app/console/vendor-subscriptions/page.tsx, the only consumer.
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const subscriptions = await (Subscription as any)
      .find({ subVendorOf: { $ne: null } })
      .sort({ createdAt: -1 })
      .lean();

    const vendorIds = Array.from(new Set(subscriptions.map((s: any) => String(s.subVendorOf))));
    const businessIds = Array.from(new Set(subscriptions.map((s: any) => String(s.businessId))));

    const [vendors, businesses] = await Promise.all([
      VendorProfile.find({ _id: { $in: vendorIds } })
        .select("companyName email contactPerson")
        .lean(),
      (Business as any).find({ _id: { $in: businessIds } }).select("name brandName").lean() as Promise<any[]>,
    ]);

    const vendorMap = new Map(vendors.map((v: any) => [String(v._id), v]));
    const businessMap = new Map(businesses.map((b: any) => [String(b._id), b]));

    const rows = subscriptions.map((s: any) => {
      const vendor = vendorMap.get(String(s.subVendorOf));
      const business = businessMap.get(String(s.businessId));
      return {
        ...s,
        vendor: vendor
          ? { _id: vendor._id, companyName: vendor.companyName, email: vendor.email, contactPerson: vendor.contactPerson }
          : null,
        business: business ? { _id: business._id, name: business.brandName || business.name } : null,
      };
    });

    return NextResponse.json({ success: true, subscriptions: rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
