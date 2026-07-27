import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Review from "@/models/Review";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/**
 * PATCH /api/reviews/[id] — moderation. NOT in middleware's PUBLIC_PREFIXES,
 * so this requires a valid an_token session (x-user-id injected by
 * middleware) — a business admin approving/rejecting a pending review.
 *
 * Was only checking for ANY logged-in user (no permission check, no
 * business-scoping) -- any authenticated user of any role from any
 * business could approve/reject any other business's reviews. Now
 * requires reviews.approve and verifies the review actually belongs to
 * the caller's active business (super admins bypass both via
 * requirePermission's existing super-admin check).
 *
 * Body: { status: "APPROVED" | "REJECTED" }
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("reviews", "approve"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const { id } = await context.params;
    const body = await req.json();
    const { status } = body ?? {};

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json(
        { success: false, message: "status must be APPROVED or REJECTED" },
        { status: 400 }
      );
    }

    const existing = await Review.findById(id).select("businessId").lean();
    if (!existing) {
      return NextResponse.json({ success: false, message: "Review not found" }, { status: 404 });
    }
    if (!session.isSuperAdmin && String((existing as any).businessId) !== String(session.business?.businessId)) {
      return NextResponse.json({ success: false, message: "Review not found" }, { status: 404 });
    }

    const review = await Review.findByIdAndUpdate(id, { status }, { new: true });

    return NextResponse.json({
      success: true,
      review: { id: String(review!._id), status: review!.status },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
