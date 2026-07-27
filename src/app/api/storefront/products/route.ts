import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import NativeProduct from "@/models/NativeProduct";
import ProductCategory from "@/models/ProductCategory";

/**
 * GET /api/storefront/products — PUBLIC, unauthenticated storefront
 * product catalog. A genuinely separate route from api/products/route.ts
 * on purpose: that route requires x-user-id and returns internal ERP
 * fields (sku/basePrice/hsn/reorderLevel) shaped for admin inventory
 * management, not a public storefront -- a logged-out visitor hitting it
 * gets a 401. This route is read-only, scoped to one business (Native
 * or any other storefront tenant), and only ever returns public-safe
 * fields.
 *
 * Query params: businessId (required), category, search, page, limit.
 *
 * Grouped by variantGroupKey (see models/NativeProduct.ts) so a product
 * sold in several pack sizes shows as ONE card here -- was returning one
 * raw document per size, so a 250g/500g/1kg product listed as three
 * separate cards in every category/search grid even though its own detail
 * page (storefront/products/[slug]/route.ts) already groups them into a
 * single page with a size selector. Grouping has to happen in the DB
 * query (via aggregation), not by dedup-ing after the fact -- deduping
 * post-pagination would silently shrink some pages below `limit`.
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = req.nextUrl;
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const filter: Record<string, unknown> = {
      businessId: new mongoose.Types.ObjectId(businessId),
      isActive: true,
      isDeleted: { $ne: true },
    };

    // `category` may be either the ProductCategory _id returned by
    // GET /api/categories (the stable reference the storefront's
    // `?category=<id>` filter is built around) or, for backward
    // compatibility, a raw category name string. NativeProduct.category
    // itself only stores the name (it's a plain string field, not a ref),
    // so an id needs resolving back to the name it matches.
    const category = searchParams.get("category");
    if (category) {
      if (mongoose.Types.ObjectId.isValid(category)) {
        const cat = await ProductCategory.findOne({ _id: category, businessId }).lean();
        filter.category = cat ? cat.name : "__no_match__";
      } else {
        filter.category = category;
      }
    }

    const search = searchParams.get("search");
    if (search) {
      (filter as any).$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(60, parseInt(searchParams.get("limit") || "24"));

    const [result] = await NativeProduct.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          // Ungrouped products (no variantGroupKey) fall back to their own
          // _id, so they behave exactly as one-off, un-grouped cards.
          _id: { $ifNull: ["$variantGroupKey", "$_id"] },
          doc: { $first: "$$ROOT" },
          minPrice: { $min: "$basePrice" },
          maxPrice: { $max: "$basePrice" },
          variantCount: { $sum: 1 },
        },
      },
      { $sort: { "doc.createdAt": -1 } },
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ]);

    const rows = result?.data || [];
    const total = result?.totalCount?.[0]?.count || 0;

    return NextResponse.json({
      success: true,
      products: rows.map((row: any) => {
        const p = row.doc;
        return {
          id: String(p._id),
          name: p.name,
          slug: p.slug,
          description: p.description,
          category: p.category,
          images: p.images || [],
          price: row.minPrice ?? p.basePrice ?? 0,
          priceMax: row.maxPrice ?? p.basePrice ?? 0,
          variantCount: row.variantCount || 1,
          unit: p.unit || "pcs",
          inStock: (p.stock || 0) > 0,
          sku: p.sku || "",
          // SEO — so the storefront can render <title>/meta description and
          // structured data without a second round-trip to
          // /api/storefront/products/[slug].
          metaTitle: p.metaTitle || p.name,
          metaDescription: p.metaDescription || p.description || "",
          keywords: p.keywords || [],
        };
      }),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
