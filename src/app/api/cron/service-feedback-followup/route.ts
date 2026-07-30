/**
 * GET /api/cron/service-feedback-followup — scheduled sweep that sends the
 * NPS survey link to every job sheet handed over (or, absent a formal
 * handover, completed) at least an hour ago that hasn't been sent one yet.
 * Per explicit direction: "a feedback page... triggered after 1 hour of
 * delivery of device or completion of service."
 *
 * NOT in vercel.json -- Vercel's free Hobby plan only allows a cron to run
 * once per day, nowhere near the ~15-minute cadence an hour-granularity
 * follow-up needs. Instead this is called by a free external scheduler
 * (e.g. cron-job.org) hitting this URL directly every 15 minutes. See the
 * project's setup notes for the exact URL + CRON_SECRET header to
 * configure there.
 *
 * Protected by a shared secret (CRON_SECRET env var) rather than a normal
 * session, since this is invoked by an external scheduler, not a logged-in
 * user.
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
