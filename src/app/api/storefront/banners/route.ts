import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Banner from "@/models/Banner";

/**
 * GET /api/storefront/banners — PUBLIC, unauthenticated homepage
 * hero-slideshow banners for a storefront tenant (Native, or any other
 * storefront tenant). Same convention as /api/storefront/products: a
 * genuinely separate, public, read-only route scoped to one business via
 * ?businessId=, returning only public-safe fields.
 *
 * Query params: businessId (required).
 *
 * Response shape:
 * {
 *   success: true,
 *   banners: [
 *     {
 *       id: string,
 *       imageUrl: string,
 *       heading: string,
 *       subheading: string,
 *       ctaText: string,
 *       ctaLink: string,
 *     },
 *     ...
 *   ]
 * }
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = req.nextUrl;
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const banners = await Banner.find({ businessId, isActive: true })
      .select("imageUrl heading subheading ctaText ctaLink sortOrder")
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      banners: banners.map((b: any) => ({
        id: String(b._id),
        imageUrl: b.imageUrl,
        heading: b.heading || "",
        subheading: b.subheading || "",
        ctaText: b.ctaText || "SHOP NOW",
        ctaLink: b.ctaLink || "/products",
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
