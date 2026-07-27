import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import NativeProduct from "@/models/NativeProduct";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

/**
 * GET /api/admin/native-products?businessId=&search= — Super Admin only.
 * Lists every storefront-facing NativeProduct for a business, including
 * inactive ones -- there was previously NO admin view of this collection
 * at all (only vendor-products, the pre-approval side), so a stray ₹0 or
 * leftover test listing that made it to NativeProduct had no way to be
 * found or removed short of raw DB access.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();
    const { searchParams } = req.nextUrl;
    const businessId = searchParams.get("businessId");
    const search = searchParams.get("search");

    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (businessId) filter.businessId = businessId;
    if (search) filter.name = { $regex: search, $options: "i" };

    const products = await NativeProduct.find(filter)
      .select("name slug sku basePrice mrp weightKg isActive images variantGroupKey createdAt businessId vendorId")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({ success: true, data: products });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
