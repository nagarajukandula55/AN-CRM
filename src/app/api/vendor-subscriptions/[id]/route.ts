import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import VendorProfile from "@/models/VendorProfile";
import VendorSubscription from "@/models/VendorSubscription";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/vendor-subscriptions/[id] — admin-only edit of a vendor's
 * trial/subscription dates (and optionally status), e.g. manually
 * extending a trial past its original window. Gated on businesses.edit,
 * same as api/businesses/[id]/route.ts -- a plain x-user-id header check
 * let ANY logged-in user, including a vendor, rewrite any vendor's trial
 * dates or force status to ACTIVE, defeating the trial paywall entirely.
 *
 * `id` is either a real Subscription._id (the instant-trial mechanism) or
 * a synthetic `vp_<VendorProfile._id>` (the universal self-signup trial --
 * see GET's own comment on why this route needs to handle both). Editing
 * a self-signup vendor's dates here used to silently do nothing at all,
 * since there was no Subscription row for it to find ("few of my users
 * facing this issue") -- this now writes VendorProfile.trialEndsAt AND
 * VendorSubscription.currentPeriodEnd together, since
 * lib/vendor/checkTrialAccess.ts consults both and either one being stale
 * would leave the vendor blocked (or wrongly unblocked) regardless of what
 * the admin just set in the UI.
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

    if (id.startsWith("vp_")) {
      const vendorId = id.slice(3);
      const vendor = await VendorProfile.findById(vendorId);
      if (!vendor) {
        return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
      }
      const before = { trialEndsAt: (vendor as any).trialEndsAt };

      // No separate "status" field exists on VendorProfile -- CANCELLED
      // (this admin page's only status action for a self-signup row) is
      // represented the same way an expired trial already blocks a
      // vendor: setting both dates into the past.
      if (body.status === "CANCELLED") {
        const past = new Date(0);
        (vendor as any).trialEndsAt = past;
        await vendor.save();
        await VendorSubscription.updateOne(
          { vendorId },
          { $set: { currentPeriodEnd: past } },
          { upsert: false }
        );
        return NextResponse.json({ success: true, subscription: { _id: id, trialEndsAt: past, expiryDate: past, status: "CANCELLED" } });
      }

      const newTrialEndsAt = body.trialEndsAt !== undefined
        ? (body.trialEndsAt ? new Date(body.trialEndsAt) : undefined)
        : (vendor as any).trialEndsAt;
      const newExpiryDate = body.expiryDate !== undefined
        ? (body.expiryDate ? new Date(body.expiryDate) : undefined)
        : newTrialEndsAt;

      (vendor as any).trialEndsAt = newTrialEndsAt;
      await vendor.save();

      await VendorSubscription.updateOne(
        { vendorId },
        { $set: { currentPeriodEnd: newExpiryDate ?? null } },
        { upsert: false }
      );

      logAction({
        action: "UPDATE",
        entity: "VendorProfile",
        entityId: vendorId,
        before,
        after: { trialEndsAt: newTrialEndsAt, currentPeriodEnd: newExpiryDate },
        req,
        actor: { id: userId },
      });

      return NextResponse.json({
        success: true,
        subscription: { _id: id, trialEndsAt: newTrialEndsAt, expiryDate: newExpiryDate },
      });
    }

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

    // Keep VendorSubscription.currentPeriodEnd in sync too -- checkTrialAccess.ts
    // also consults it as a secondary "still within a real paid period" check,
    // so a stale value there could leave a vendor blocked even after the admin
    // just extended their Subscription dates here.
    if (body.expiryDate !== undefined || body.trialEndsAt !== undefined) {
      const syncedEnd = subscription.expiryDate ?? subscription.trialEndsAt ?? null;
      await VendorSubscription.updateOne(
        { vendorId: subscription.subVendorOf },
        { $set: { currentPeriodEnd: syncedEnd } },
        { upsert: false }
      );
    }

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
