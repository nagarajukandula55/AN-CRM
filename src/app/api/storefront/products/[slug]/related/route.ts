import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import NativeProduct from "@/models/NativeProduct";

/**
 * GET /api/storefront/products/[slug]/related — PUBLIC. Same-category
 * products, excluding the product itself, for the storefront's product-page
 * "related products" rail.
 *
 * Moved here from /api/products/[slug]/related — Next.js does not allow two
 * sibling dynamic segments with different names under the same route
 * (/api/products/[id] vs /api/products/[slug]), which made the whole app
 * fail to build. This route and its sibling ../route.ts are public/
 * storefront-facing anyway, so they belong under /api/storefront/products
 * next to the other public product route, not under the admin-authenticated
 * /api/products tree.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();

    const { slug } = await context.params;
    const businessId = req.nextUrl.searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const product = await NativeProduct.findOne({ slug, businessId }).select("category").lean();
    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    const limit = Math.min(20, parseInt(req.nextUrl.searchParams.get("limit") || "8"));

    const related = await NativeProduct.find({
      businessId,
      category: (product as any).category,
      slug: { $ne: slug },
      isActive: true,
      isDeleted: { $ne: true },
    })
      .select("name slug images basePrice unit stock")
      .limit(limit)
      .lean();

    return NextResponse.json({
      success: true,
      products: related.map((p: any) => ({
        id: String(p._id),
        name: p.name,
        slug: p.slug,
        images: p.images || [],
        price: p.basePrice || 0,
        unit: p.unit || "pcs",
        inStock: (p.stock || 0) > 0,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
