/**
 * GET /api/cron/check-subscriptions — the "autonomous system" that flips
 * any ACTIVE subscription past its expiryDate to EXPIRED, per explicit
 * direction ("upon reaching deadline services should get stopped
 * automatically and should ask them to make the payment"). Run daily via
 * Vercel Cron (see vercel.json). Protected by CRON_SECRET so this can't be
 * triggered by an arbitrary request -- Vercel Cron sends this header
 * automatically for scheduled invocations.
 *
 * This route only flips the STATUS -- actually blocking usage happens
 * client-side (AdminShell checks /api/subscriptions/status and redirects
 * to /console/plan when blocked) plus should be added as a hard server-side
 * gate on write routes in a follow-up pass; flagged, not yet done
 * everywhere.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Subscription from "@/models/Subscription";
import { sendVendorTelegramMessage } from "@/core/telegram/sendVendorTelegramMessage";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Reminder window BEFORE flipping to EXPIRED, so a vendor whose
    // routing has SUBSCRIPTION_EXPIRY enabled gets a heads-up while they
    // can still act, not just a "you're already cut off" notice.
    const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const expiringSoon = await Subscription.find({
      status: "ACTIVE",
      expiryDate: { $gte: new Date(), $lte: in3Days },
    }).select("businessId expiryDate").lean();

    for (const sub of expiringSoon) {
      const days = Math.ceil((new Date(sub.expiryDate!).getTime() - Date.now()) / 86400000);
      await sendVendorTelegramMessage(
        String(sub.businessId),
        "SUBSCRIPTION_EXPIRY",
        `Your subscription expires in ${days} day${days === 1 ? "" : "s"} (${new Date(sub.expiryDate!).toLocaleDateString("en-IN")}). Renew from Plan & Billing to avoid service interruption.`
      ).catch(() => {});
    }

    const expiring = await Subscription.find({ status: "ACTIVE", expiryDate: { $lt: new Date() } })
      .select("businessId")
      .lean();

    const result = await Subscription.updateMany(
      { status: "ACTIVE", expiryDate: { $lt: new Date() } },
      { $set: { status: "EXPIRED" } }
    );

    for (const sub of expiring) {
      await sendVendorTelegramMessage(
        String(sub.businessId),
        "PAYMENT_DUE",
        `Your subscription has expired. Services are now paused until payment is made -- please renew from Plan & Billing.`
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, expiredCount: result.modifiedCount, remindedCount: expiringSoon.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
