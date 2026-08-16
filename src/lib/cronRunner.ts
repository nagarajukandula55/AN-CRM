/**
 * Shared "run every due scheduled job" logic, used by both
 * GET /api/cron/run-all (for an external scheduler) and the Telegram
 * bot's /runjobs command (for a manual "run now" trigger -- see
 * api/telegram/webhook's comment on why that's a real but different thing
 * from actual unattended cron). Pulled out of the route so both callers
 * share one implementation instead of the webhook doing its own HTTP
 * self-call.
 */
import CronJobLog from "@/models/CronJobLog";

const MIN_INTERVAL_HOURS = 20; // small slack under 24h, same convention as telegram-business-report's isDue()

export const CRON_JOBS: { key: string; path: string }[] = [
  { key: "check-subscriptions", path: "/api/cron/check-subscriptions" },
  { key: "ops-report", path: "/api/cron/ops-report" },
  { key: "run-scheduled-reports", path: "/api/cron/run-scheduled-reports" },
  { key: "service-feedback-followup", path: "/api/cron/service-feedback-followup" },
  { key: "expire-agreements", path: "/api/cron/expire-agreements" },
];

function isDue(lastRunAt: Date | undefined, now: Date): boolean {
  if (!lastRunAt) return true;
  return (now.getTime() - new Date(lastRunAt).getTime()) / 3600000 >= MIN_INTERVAL_HOURS;
}

export async function runAllDueCronJobs(baseUrl: string, opts?: { force?: boolean }): Promise<Record<string, string>> {
  const now = new Date();
  const results: Record<string, string> = {};

  for (const job of CRON_JOBS) {
    const log = await CronJobLog.findOne({ jobKey: job.key });
    if (!opts?.force && !isDue(log?.lastRunAt, now)) {
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

  return results;
}
