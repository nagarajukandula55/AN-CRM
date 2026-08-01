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
 * no-ops. Jobs are invoked via an internal HTTP call to their existing
 * route (not inlined) so each one keeps its own file, its own tests, and
 * can still be hit directly for manual/debug runs.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import CronJobLog from "@/models/CronJobLog";

const MIN_INTERVAL_HOURS = 20; // small slack under 24h, same convention as telegram-business-report's isDue()

const CRON_JOBS: { key: string; path: string }[] = [
  { key: "check-subscriptions", path: "/api/cron/check-subscriptions" },
  { key: "ops-report", path: "/api/cron/ops-report" },
  { key: "run-scheduled-reports", path: "/api/cron/run-scheduled-reports" },
  { key: "service-feedback-followup", path: "/api/cron/service-feedback-followup" },
  { key: "telegram-business-report", path: "/api/cron/telegram-business-report" },
];

function isDue(lastRunAt: Date | undefined, now: Date): boolean {
  if (!lastRunAt) return true;
  return (now.getTime() - new Date(lastRunAt).getTime()) / 3600000 >= MIN_INTERVAL_HOURS;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const now = new Date();
    const results: Record<string, string> = {};

    for (const job of CRON_JOBS) {
      const log = await CronJobLog.findOne({ jobKey: job.key });
      if (!isDue(log?.lastRunAt, now)) {
        results[job.key] = "skipped (not due)";
        continue;
      }

      const start = Date.now();
      try {
        const res = await fetch(`${baseUrl}${job.path}`, {
          headers: process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
        });
        const body = await res.text();
        const status = res.ok ? "SUCCESS" : "ERROR";
        await CronJobLog.findOneAndUpdate(
          { jobKey: job.key },
          { lastRunAt: now, lastStatus: status, lastMessage: body.slice(0, 2000), lastDurationMs: Date.now() - start },
          { upsert: true }
        );
        results[job.key] = `${status} (${res.status})`;
      } catch (err: any) {
        await CronJobLog.findOneAndUpdate(
          { jobKey: job.key },
          { lastRunAt: now, lastStatus: "ERROR", lastMessage: err?.message || "Unknown error", lastDurationMs: Date.now() - start },
          { upsert: true }
        );
        results[job.key] = `ERROR (${err?.message || "unknown"})`;
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
