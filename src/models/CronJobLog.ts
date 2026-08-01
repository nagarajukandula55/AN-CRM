/**
 * CronJobLog — one row per scheduled job, tracking when it last ran and
 * whether it succeeded. Exists because scheduling moved off Vercel's
 * built-in `crons` config (vercel.json) -- the Hobby plan caps a project at
 * 2 cron jobs total, invoked at most once a day, which this app's 5 jobs
 * already exceeded (some entries were silently never firing). Instead, one
 * external pinger (any free scheduler -- cron-job.org, GitHub Actions, a
 * UptimeRobot heartbeat, etc.) hits /api/cron/run-all on a short interval
 * (e.g. hourly), and run-all decides which jobs are actually due by
 * checking `lastRunAt` here against each job's own frequency -- so the
 * external pinger's interval only needs to be "at least as often as the
 * most frequent job," not an exact per-job schedule.
 *
 * `jobKey` is the stable identifier (matches CRON_JOBS[].key in
 * api/cron/run-all/route.ts), not the route path, so renaming a route
 * doesn't orphan its history.
 */
import mongoose, { Schema, Model, Document } from "mongoose";

export interface ICronJobLog extends Document {
  jobKey: string;
  lastRunAt?: Date;
  lastStatus?: "SUCCESS" | "ERROR" | "SKIPPED";
  lastMessage?: string;
  lastDurationMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

const CronJobLogSchema = new Schema<ICronJobLog>(
  {
    jobKey: { type: String, required: true, unique: true, trim: true },
    lastRunAt: { type: Date },
    lastStatus: { type: String, enum: ["SUCCESS", "ERROR", "SKIPPED"] },
    lastMessage: { type: String, trim: true },
    lastDurationMs: { type: Number },
  },
  { timestamps: true }
);

const CronJobLog: Model<ICronJobLog> =
  (mongoose.models.CronJobLog as Model<ICronJobLog>) ||
  mongoose.model<ICronJobLog>("CronJobLog", CronJobLogSchema);

export default CronJobLog;
