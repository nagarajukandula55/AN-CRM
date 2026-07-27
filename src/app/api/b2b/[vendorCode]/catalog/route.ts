import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import VendorProduct from "@/models/VendorProduct";
import { getProductCostAndTiers } from "@/core/pricing/productCost";
import { getB2BSession } from "@/lib/auth/b2bSession";

// GET /api/b2b/:vendorCode/catalog — this vendor's approved products, each
// priced at the logged-in account's own channel tier (Distributor/Retailer)
// and quantity (?qty=, defaults to 1, resolves MOQ slabs) -- never the
// Online/D2C price.
export async function GET(req: NextRequest, { params }: { params: Promise<{ vendorCode: string }> }) {
  try {
    const session = await getB2BSession();
    if (!session) return NextResponse.json({ success: false, message: "Not logged in" }, { status: 401 });

    const { vendorCode } = await params;
    await connectDB();

    const vendor = await VendorProfile.findOne({ vendorId: vendorCode }).select("_id enableB2BOrdering");
    if (!vendor || String(vendor._id) !== session.vendorId) {
      return NextResponse.json({ success: false, message: "Vendor mismatch" }, { status: 403 });
    }

    const qty = Number(req.nextUrl.searchParams.get("qty") || 1);
    const tierKey = session.type === "DISTRIBUTOR" ? "distributor" : "retailer";

    const products = await VendorProduct.find({ vendorId: vendor._id, status: "APPROVED", active: true })
      .select("_id productName variantName vendorSku unit images minimumOrderQty")
      .lean();

    const priced = await Promise.all(
      products.map(async (p: any) => {
        const result = await getProductCostAndTiers(String(p._id), { qty });
        const tier = result?.tiers.find((t) => t.key === tierKey);
        return {
          _id: p._id,
          name: [p.productName, p.variantName].filter(Boolean).join(" "),
          vendorSku: p.vendorSku,
          unit: p.unit,
          images: p.images,
          minimumOrderQty: p.minimumOrderQty || 1,
          price: tier?.price || 0,
          marginPercent: tier?.marginPercent,
        };
      })
    );

    return NextResponse.json({ success: true, data: priced.filter((p) => p.price > 0) });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
