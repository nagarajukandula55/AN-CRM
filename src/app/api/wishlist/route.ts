import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Wishlist from "@/models/Wishlist";
import NativeProduct from "@/models/NativeProduct";

/**
 * /api/wishlist — authenticated (NOT in middleware's PUBLIC_PREFIXES), so
 * x-user-id is always present here, injected from the verified an_token
 * cookie. A wishlist is one document per (userId, businessId).
 */

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const businessId = req.nextUrl.searchParams.get("businessId");
    if (!businessId || !mongoose.Types.ObjectId.isValid(businessId)) {
      return NextResponse.json(
        { success: false, message: "businessId is required" },
        { status: 400 }
      );
    }

    const wishlist = await Wishlist.findOne({ userId, businessId }).lean();
    const productIds = (wishlist as any)?.productIds || [];

    const products = productIds.length
      ? await NativeProduct.find({
          _id: { $in: productIds },
          isActive: true,
          isDeleted: { $ne: true },
        })
          .select("name slug description category images basePrice unit stock")
          .lean()
      : [];

    return NextResponse.json({
      success: true,
      products: products.map((p: any) => ({
        id: String(p._id),
        name: p.name,
        slug: p.slug,
        description: p.description,
        category: p.category,
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

/** Body: { businessId, productId } — adds productId to the wishlist. */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const { businessId, productId } = body ?? {};

    if (
      !businessId ||
      !productId ||
      !mongoose.Types.ObjectId.isValid(businessId) ||
      !mongoose.Types.ObjectId.isValid(productId)
    ) {
      return NextResponse.json(
        { success: false, message: "businessId and productId are required" },
        { status: 400 }
      );
    }

    const wishlist = await Wishlist.findOneAndUpdate(
      { userId, businessId },
      { $addToSet: { productIds: productId } },
      { new: true, upsert: true }
    );

    return NextResponse.json({
      success: true,
      productIds: wishlist.productIds.map((id) => String(id)),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/** Body: { businessId, productId } — removes productId from the wishlist. */
export async function DELETE(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json().catch(() => ({}));
    const businessId = body?.businessId || req.nextUrl.searchParams.get("businessId");
    const productId = body?.productId || req.nextUrl.searchParams.get("productId");

    if (
      !businessId ||
      !productId ||
      !mongoose.Types.ObjectId.isValid(businessId) ||
      !mongoose.Types.ObjectId.isValid(productId)
    ) {
      return NextResponse.json(
        { success: false, message: "businessId and productId are required" },
        { status: 400 }
      );
    }

    const wishlist = await Wishlist.findOneAndUpdate(
      { userId, businessId },
      { $pull: { productIds: productId } },
      { new: true }
    );

    return NextResponse.json({
      success: true,
      productIds: wishlist ? wishlist.productIds.map((id) => String(id)) : [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
