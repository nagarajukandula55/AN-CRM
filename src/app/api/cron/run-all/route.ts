/**
 * GET /api/cron/run-all — single entry point for every scheduled job,
 * replacing vercel.json's per-route `crons` list. Vercel's Hobby plan caps
 * a project at 2 cron jobs total, invoked at most once a day; this app has
 * 5 jobs (one, sync-trackings, didn't even have a route behind it), so
 * several were silently never firing. This route is meant to be pinged by
 * ONE external scheduler (any free one -- cron-job.org, GitHub Actions
 * `schedule:`, UptimeRobot, etc.) on a short interval, e.g. hourly, hitting
 *
 *   GET https://<your-domain>/api/cron/run-all
 *   Header: Authorization: Bearer <CRON_SECRET>
 *
 * Each job below only actually runs once its own minimum interval has
 * elapsed since CronJobLog.lastRunAt -- so pinging this hourly is safe even
 * though every job here is logically "daily": the extra pings are cheap
 * no-ops. See lib/cronRunner.ts for the shared implementation -- the
 * Telegram bot's /runjobs command (api/telegram/webhook) uses the same
 * function as a manual "run now" alternative to setting up an external
 * scheduler.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { runAllDueCronJobs } from "@/lib/cronRunner";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const results = await runAllDueCronJobs(baseUrl);

    return NextResponse.json({ success: true, results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
