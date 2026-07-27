import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Review from "@/models/Review";
import { getAuthUser } from "@/lib/auth/jwt";

/**
 * GET /api/reviews — PUBLIC, unauthenticated review list for a product.
 * Only ever returns APPROVED reviews to an anonymous/unauthenticated
 * caller — this route lives in middleware's PUBLIC_PREFIXES so no JWT
 * verification runs, meaning x-user-id is never injected here.
 *
 * Query params: productId (required), businessId (required), page, limit.
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = req.nextUrl;
    const productId = searchParams.get("productId");
    const businessId = searchParams.get("businessId");

    if (!productId || !businessId) {
      return NextResponse.json(
        { success: false, message: "productId and businessId are required" },
        { status: 400 }
      );
    }
    if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(businessId)) {
      return NextResponse.json(
        { success: false, message: "productId/businessId must be valid ids" },
        { status: 400 }
      );
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, parseInt(searchParams.get("limit") || "20"));

    const filter = {
      productId,
      businessId,
      status: "APPROVED",
      isDeleted: { $ne: true },
    };

    const [reviews, total, ratingAgg] = await Promise.all([
      Review.find(filter)
        .select("reviewerName rating title comment createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
      Review.aggregate([
        {
          $match: {
            productId: new mongoose.Types.ObjectId(productId),
            businessId: new mongoose.Types.ObjectId(businessId),
            status: "APPROVED",
            isDeleted: { $ne: true },
          },
        },
        { $group: { _id: null, avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
    ]);

    const summary = ratingAgg[0] || { avgRating: 0, count: 0 };

    return NextResponse.json({
      success: true,
      reviews: reviews.map((r: any) => ({
        id: String(r._id),
        reviewerName: r.reviewerName,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        averageRating: Math.round((summary.avgRating || 0) * 10) / 10,
        count: summary.count || 0,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/**
 * POST /api/reviews — PUBLIC create. Anyone (logged-in customer or guest)
 * can submit a review; it always lands as PENDING and is invisible to the
 * public list route until a business admin moderates it. If an an_token
 * cookie/Bearer header IS present (optional — this route is public so
 * middleware won't inject x-user-id), we still attach the userId by
 * verifying it directly here.
 *
 * Body: { productId, businessId, rating, reviewerName, reviewerEmail?, title?, comment? }
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { productId, businessId, rating, reviewerName, reviewerEmail, title, comment } = body ?? {};

    if (!productId || !businessId) {
      return NextResponse.json(
        { success: false, message: "productId and businessId are required" },
        { status: 400 }
      );
    }

    const numericRating = Number(rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return NextResponse.json(
        { success: false, message: "rating must be a number between 1 and 5" },
        { status: 400 }
      );
    }

    const authUser = getAuthUser(req);
    const name = (reviewerName || authUser?.name || "").trim();
    if (!name) {
      return NextResponse.json(
        { success: false, message: "reviewerName is required" },
        { status: 400 }
      );
    }

    const review = await Review.create({
      productId,
      businessId,
      userId: authUser?.id || null,
      reviewerName: name,
      reviewerEmail: reviewerEmail || authUser?.email || null,
      rating: numericRating,
      title: title?.trim() || "",
      comment: comment?.trim() || "",
      status: "PENDING",
    });

    return NextResponse.json(
      {
        success: true,
        message: "Review submitted and pending moderation",
        review: { id: String(review._id), status: review.status },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
