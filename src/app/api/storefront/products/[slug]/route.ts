import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import NativeProduct from "@/models/NativeProduct";

/**
 * GET /api/storefront/products/[slug] — PUBLIC, unauthenticated
 * single-product page. Scoped to businessId via query param so a storefront
 * tenant only ever sees its own products; only public-safe fields are
 * returned, matching api/storefront/products/route.ts's shape.
 *
 * Moved here from /api/products/[slug] — Next.js disallows sibling dynamic
 * segments with different names under one route (/api/products/[id] vs
 * /api/products/[slug]), which broke the build. This route is public/
 * storefront-facing, so it belongs under /api/storefront/products.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();

    const { slug } = await context.params;
    const businessId = req.nextUrl.searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const product = await NativeProduct.findOne({
      slug,
      businessId,
      isActive: true,
      isDeleted: { $ne: true },
    })
      .select("name slug description category images basePrice mrp unit stock hsn taxRate sku createdAt metaTitle metaDescription keywords variantGroupKey variantValue variantUnit")
      .lean();

    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    const p = product as any;

    // Sibling pack-sizes/variants of the same product (see approve route's
    // variantGroupKey) -- the storefront PDP renders these as a size
    // selector that swaps price/stock in place, no separate page per
    // variant. Includes this product itself so the frontend's "variants[0]"
    // default-selection still lands on the page being viewed.
    const variants = p.variantGroupKey
      ? await NativeProduct.find({
          businessId,
          variantGroupKey: p.variantGroupKey,
          isActive: true,
          isDeleted: { $ne: true },
        })
          .select("_id slug basePrice mrp stock variantValue variantUnit")
          .sort({ variantValue: 1 })
          .lean()
      : [];

    return NextResponse.json({
      success: true,
      product: {
        id: String(p._id),
        name: p.name,
        slug: p.slug,
        description: p.description,
        category: p.category,
        images: p.images || [],
        price: p.basePrice || 0,
        mrp: p.mrp || 0,
        unit: p.unit || "pcs",
        inStock: (p.stock || 0) > 0,
        taxRate: p.taxRate || 0,
        sku: p.sku || "",
        // SEO fields — meta title/description for <head>, keywords for tags,
        // canonicalSlug so the frontend can build a canonical <link> without
        // re-deriving it (it's the same value as slug by construction here).
        metaTitle: p.metaTitle || p.name,
        metaDescription: p.metaDescription || p.description || "",
        keywords: p.keywords || [],
        canonicalSlug: p.slug,
      },
      variants: variants.map((v: any) => ({
        _id: String(v._id),
        slug: v.slug,
        value: v.variantValue,
        unit: v.variantUnit,
        sellingPrice: v.basePrice || 0,
        mrp: v.mrp || 0,
        stock: v.stock ?? null,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
