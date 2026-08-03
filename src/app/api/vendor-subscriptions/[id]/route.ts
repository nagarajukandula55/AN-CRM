import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/vendor-subscriptions/[id] — admin-only edit of a vendor's
 * trial/subscription dates (and optionally status), e.g. manually
 * extending a trial past its original 7 days. Gated on businesses.edit,
 * same as api/businesses/[id]/route.ts -- a plain x-user-id header check
 * let ANY logged-in user, including a vendor, rewrite any vendor's trial
 * dates or force status to ACTIVE, defeating the trial paywall entirely.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("businesses", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }
    const userId = session.user.id;

    const { id } = await context.params;
    const body = await req.json();

    const subscription = await (Subscription as any).findById(id);
    if (!subscription || !subscription.subVendorOf) {
      return NextResponse.json({ success: false, error: "Vendor subscription not found" }, { status: 404 });
    }

    const before = subscription.toObject();

    if (body.trialEndsAt !== undefined) {
      subscription.trialEndsAt = body.trialEndsAt ? new Date(body.trialEndsAt) : undefined;
    }
    if (body.expiryDate !== undefined) {
      subscription.expiryDate = body.expiryDate ? new Date(body.expiryDate) : undefined;
    }
    if (body.status && ["TRIAL", "PENDING_PAYMENT", "ACTIVE", "EXPIRED", "CANCELLED"].includes(body.status)) {
      subscription.status = body.status;
    }

    await subscription.save();

    logAction({
      action: "UPDATE",
      entity: "Subscription",
      entityId: id,
      before,
      after: subscription,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, subscription });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
