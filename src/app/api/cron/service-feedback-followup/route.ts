/**
 * GET /api/cron/service-feedback-followup — scheduled sweep (see
 * vercel.json's cron entry) that sends the NPS survey link to every job
 * sheet handed over (or, absent a formal handover, completed) at least an
 * hour ago that hasn't been sent one yet. Per explicit direction: "a
 * feedback page... triggered after 1 hour of delivery of device or
 * completion of service."
 *
 * Protected by a shared secret (CRON_SECRET env var) rather than a normal
 * session, since this is invoked by Vercel's scheduler, not a logged-in
 * user. Runs every 15 minutes (see vercel.json) -- an hour-granularity
 * requirement doesn't need per-minute precision, and this keeps the sweep
 * cheap.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import { notifyCustomer } from "@/lib/customerNotify";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const due = await CrmJobSheet.find({
      isDeleted: false,
      feedbackToken: { $exists: true, $ne: null },
      feedbackRequestSentAt: { $exists: false },
      $or: [
        { handedOverAt: { $lte: oneHourAgo } },
        { handedOverAt: { $exists: false }, completedAt: { $lte: oneHourAgo } },
      ],
    })
      .select("businessId phone jobSheetNumber feedbackToken")
      .limit(200)
      .lean<any[]>();

    let sent = 0;
    for (const job of due) {
      const link = `${APP_URL}/feedback/service/${job.feedbackToken}`;
      const message = `Thank you for choosing us for Workorder ${job.jobSheetNumber}! We'd love your feedback: ${link}`;
      await notifyCustomer(job.businessId.toString(), job.phone, message);
      await CrmJobSheet.updateOne({ _id: job._id }, { $set: { feedbackRequestSentAt: new Date() } });
      sent += 1;
    }

    return NextResponse.json({ success: true, checked: due.length, sent });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
