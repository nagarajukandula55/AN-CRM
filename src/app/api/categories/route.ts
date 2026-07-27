import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ProductCategory from "@/models/ProductCategory";

/**
 * GET /api/categories — PUBLIC, unauthenticated storefront category list.
 *
 * Built for the Native storefront integration: a logged-out visitor
 * browsing the homepage category grid / product filters previously had
 * nowhere to hit (this route didn't exist), per the gap Native's own
 * ANGROUP_INTEGRATION_STATUS.md documented.
 *
 * IMPORTANT — this route previously read `NativeProduct.distinct("category")`
 * on the theory that "no dedicated Category model exists in this codebase".
 * That was stale: `models/ProductCategory.ts` DOES exist, businessId-scoped,
 * with a full admin master-data UI at
 * `admin/masters/product-categories/page.tsx` and CRUD API at
 * `api/product-categories/route.ts`. This route now reads from THAT
 * collection (the real source of truth an admin actually manages) instead
 * of deriving categories from whatever free-text strings happen to be set
 * on products. Each category's `id` is its real ProductCategory _id, so the
 * storefront's `?category=<id>` filter is a stable reference rather than a
 * fragile free-text match — see api/storefront/products/route.ts, which
 * resolves that id back to the category name NativeProduct.category stores.
 *
 * Deliberately does NOT reuse api/products/route.ts (that route requires
 * x-user-id and returns internal ERP fields) -- this is a new,
 * intentionally public, read-only, storefront-safe endpoint.
 */
function slugify(name: string): string {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const businessId = req.nextUrl.searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const categories = await ProductCategory.find({
      businessId,
      isActive: true,
      isDeleted: { $ne: true },
    })
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      categories: categories.map((c) => ({
        id: String(c._id),
        name: c.name,
        slug: slugify(c.name),
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
