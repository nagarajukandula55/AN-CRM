import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import { logAction } from "@/lib/audit/logAction";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/vendor-subscriptions/[id] — admin-only edit of a vendor's
 * trial/subscription dates (and optionally status), e.g. manually
 * extending a trial past its original 7 days. Same x-user-id admin-auth
 * pattern as api/vendors/[id]/finalize/route.ts -- no separate
 * super-admin-only gate exists at this layer for this admin console
 * section, matching that route.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

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
