/**
 * GET /api/cron/telegram-business-reports — actually SCHEDULES the
 * Daily/Weekly/Monthly Telegram business report (lib/telegramReport.ts,
 * core/telegram/sendBusinessReport.ts). Until this route existed, that
 * report only ever sent on-demand, from a vendor/admin typing /report or
 * /sendreports into the bot -- a vendor's own
 * telegramReportFrequency setting (VendorProfile, configured from
 * console/admin/telegram-ids) had nothing actually reading it on a timer.
 *
 * Runs (via api/cron/run-all -- see lib/cronRunner.ts; needs to be invoked
 * roughly hourly for telegramReportTime below to land anywhere close to
 * accurate) against EVERY vendor with a frequency set, and decides
 * per-vendor whether THAT vendor's report is due today/this-week/this-month
 * AND whether their own telegramReportTime ("HH:mm", IST) has passed --
 * a bot can't ask Telegram itself to deliver at a given time (only a human
 * composing in the Telegram client can schedule a send), so this is this
 * app's own approximation of "send at 9am", accurate to whatever cadence
 * run-all is actually invoked at.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import { sendVendorBusinessReport } from "@/core/telegram/sendBusinessReport";

// Minimum elapsed time since the last send before this frequency is even
// eligible again -- guards against sending twice in one day/week/month if
// run-all happens to fire more than once after telegramReportTime passes.
const MIN_INTERVAL_HOURS: Record<string, number> = {
  DAILY: 20,
  WEEKLY: 24 * 6,
  MONTHLY: 24 * 26,
};

function istNow(now: Date): Date {
  // IST = UTC+5:30, and this app operates in IST throughout (see
  // buildReportMessage's now.toLocaleDateString("en-IN") elsewhere) --
  // shift so getHours()/getMinutes() below read as IST regardless of the
  // server's own timezone.
  return new Date(now.getTime() + 5.5 * 3600000);
}

function isDue(frequency: string, lastSentAt: Date | undefined, reportTime: string | undefined, now: Date): boolean {
  const minHours = MIN_INTERVAL_HOURS[frequency] ?? MIN_INTERVAL_HOURS.DAILY;
  if (lastSentAt && (now.getTime() - new Date(lastSentAt).getTime()) / 3600000 < minHours) return false;

  const [h, m] = (reportTime || "09:00").split(":").map((n) => parseInt(n, 10));
  const nowIst = istNow(now);
  const scheduledMinutes = (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0);
  const nowMinutes = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
  return nowMinutes >= scheduledMinutes;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const now = new Date();
    const vendors = await VendorProfile.find({
      telegramReportFrequency: { $in: ["DAILY", "WEEKLY", "MONTHLY"] },
      isDeleted: { $ne: true },
    })
      .select("_id telegramReportFrequency telegramReportLastSentAt telegramReportTime")
      .lean();

    let sentCount = 0;
    let skippedCount = 0;
    const failures: string[] = [];

    for (const vendor of vendors) {
      const frequency = (vendor as any).telegramReportFrequency as string;
      if (!isDue(frequency, (vendor as any).telegramReportLastSentAt, (vendor as any).telegramReportTime, now)) {
        skippedCount++;
        continue;
      }
      try {
        const result = await sendVendorBusinessReport(String(vendor._id));
        if (result.sent) sentCount++;
        else skippedCount++;
      } catch (err: any) {
        failures.push(`${vendor._id}: ${err?.message || "unknown error"}`);
      }
    }

    return NextResponse.json({ success: true, dueCount: vendors.length, sentCount, skippedCount, failures });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
