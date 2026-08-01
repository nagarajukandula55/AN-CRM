# Scheduled jobs

This app no longer uses Vercel's built-in `crons` config in `vercel.json`.
Vercel's Hobby plan caps a project at 2 cron jobs total, invoked at most
once a day — this app has 5 scheduled jobs (and one entry,
`sync-trackings`, didn't even have a route behind it), so several jobs were
silently never firing.

Instead, every job runs through one consolidated endpoint:

```
GET /api/cron/run-all
Authorization: Bearer <CRON_SECRET>
```

Each underlying job (`check-subscriptions`, `ops-report`,
`run-scheduled-reports`, `service-feedback-followup`,
`telegram-business-report`) only actually executes once its own ~daily
interval has elapsed since its last run — tracked per job in the
`CronJobLog` collection (`src/models/CronJobLog.ts`). So pinging
`run-all` more often than daily is safe and cheap; the extra pings are
no-ops until a job is actually due.

## One-time setup

1. Set `CRON_SECRET` in your Vercel project's environment variables (any
   random string) if it isn't already set.
2. Pick any free external scheduler and point it at
   `https://<your-domain>/api/cron/run-all`, sending header
   `Authorization: Bearer <CRON_SECRET>`, on an hourly interval:
   - [cron-job.org](https://cron-job.org) — free, simplest to set up.
   - A GitHub Actions workflow with a `schedule:` trigger in this repo.
   - An UptimeRobot "heartbeat" monitor pointed at the URL.

That's it — no vercel.json changes needed for new jobs going forward; add
the job's route + an entry to the `CRON_JOBS` array in
`src/lib/cronRunner.ts` and it's covered by the same external ping.

## Manual alternative: /runjobs on Telegram

If you'd rather not set up an external scheduler, the bot supports a
manual "run now" command instead: send `/runjobs` to it. This is **not**
real cron — nothing runs unless you actually send the command — so it
only makes sense if you're checking in periodically yourself rather than
wanting unattended automation.

To enable it:
1. Set `ANOPS_TELEGRAM_ADMIN_CHAT_IDS` in your env vars to your own
   Telegram chat id (get it via `/tgid`), comma-separated if more than
   one admin. This command touches every business's data, not just the
   sender's own, so it's restricted to this allowlist.
2. Message the bot `/runjobs` any time you want to trigger due jobs.
