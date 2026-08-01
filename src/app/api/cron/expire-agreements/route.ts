/**
 * GET /api/cron/expire-agreements — flips any agreement past its
 * `expiresAt` to EXPIRED, unless it's already FULLY_SIGNED (a completed
 * agreement's expiry is a contractual term inside its own text, not
 * something this app should silently invalidate) or already terminal
 * (CANCELLED/DECLINED/EXPIRED). Logs the transition into the agreement's
 * own expiryHistory (see models/Agreement.ts) so "why did this expire" is
 * visible on the agreement itself. Same CRON_SECRET protection as every
 * other cron route in this app (see check-subscriptions/route.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Agreement from "@/models/Agreement";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const due = await Agreement.find({
      expiresAt: { $lt: new Date() },
      status: { $nin: ["FULLY_SIGNED", "EXPIRED", "CANCELLED", "DECLINED"] },
    }).select("_id expiresAt status");

    for (const agreement of due) {
      agreement.expiryHistory.push({
        action: "EXPIRED",
        at: new Date(),
        previousExpiresAt: agreement.expiresAt,
        previousStatus: agreement.status,
      } as any);
      agreement.status = "EXPIRED";
      await agreement.save();
    }

    return NextResponse.json({ success: true, expiredCount: due.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
