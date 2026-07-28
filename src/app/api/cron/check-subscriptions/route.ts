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

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const result = await Subscription.updateMany(
      { status: "ACTIVE", expiryDate: { $lt: new Date() } },
      { $set: { status: "EXPIRED" } }
    );

    return NextResponse.json({ success: true, expiredCount: result.modifiedCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
