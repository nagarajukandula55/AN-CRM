/**
 * GET /api/cron/telegram-business-report — runs daily (see vercel.json),
 * and for every business with Business.telegramReportFrequency set
 * (DAILY/WEEKLY/MONTHLY) and a telegramChatId configured, sends a full
 * business-summary Telegram message once it's actually due (based on
 * telegramReportLastSentAt): revenue + workorders/calls this period vs.
 * the prior period, as a monospace numbers table, followed by a bar-chart
 * image (via QuickChart's hosted Chart.js-to-PNG API -- no native
 * canvas/headless-browser dependency, same "no native binary" pattern
 * already used elsewhere in this app, e.g. the `qrcode` package for UPI
 * QR codes) comparing the two periods.
 *
 * Gated by the "telegram-reports" plan feature (see
 * core/pricing/planAccess.ts) -- a business whose plan no longer includes
 * it (e.g. downgraded) is silently skipped, same as any other plan-gated
 * module.
 *
 * Same CRON_SECRET convention as every other cron route.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import { getAllowedModuleKeys, getActivePlanKey } from "@/core/pricing/planAccess";
import { sendTelegramMessage, sendTelegramPhoto } from "@/lib/telegram";
import { buildReportMessage, buildChartUrl } from "@/lib/telegramReport";

function isDue(frequency: string, lastSentAt: Date | undefined, now: Date): boolean {
  if (!lastSentAt) return true;
  const hoursSince = (now.getTime() - new Date(lastSentAt).getTime()) / 3600000;
  if (frequency === "DAILY") return hoursSince >= 20; // small slack around exact 24h boundary
  if (frequency === "WEEKLY") return hoursSince >= 24 * 6.5;
  if (frequency === "MONTHLY") return hoursSince >= 24 * 27;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const now = new Date();
    const candidates = await Business.find({
      telegramReportFrequency: { $in: ["DAILY", "WEEKLY", "MONTHLY"] },
      telegramChatId: { $nin: [null, ""] },
      isActive: true,
    }).select("name operatingMode telegramChatId telegramReportFrequency telegramReportLastSentAt");

    let sentCount = 0;
    for (const business of candidates) {
      if (!isDue(business.telegramReportFrequency!, business.telegramReportLastSentAt, now)) continue;

      try {
        const mode = (business.operatingMode || "SC") as "BRAND" | "SC" | "POS";
        const plan = await getActivePlanKey(String(business._id));
        const allowed = await getAllowedModuleKeys(mode, plan);
        if (allowed && !allowed.includes("telegram-reports")) continue; // plan no longer includes this

        const isSC = mode === "SC";
        const activityLabel = isSC ? "Workorders" : "Calls";
        const { text, current, prior } = await buildReportMessage(business.name, business.telegramReportFrequency!, isSC, String(business._id), now);

        await sendTelegramMessage(text, { chatId: business.telegramChatId, parseMode: "HTML" });

        // QuickChart renders a Chart.js config into a PNG server-side --
        // https://quickchart.io/documentation/ -- no API key needed for
        // this volume, and the whole config travels as one URL, so
        // Telegram's sendPhoto (which fetches by URL) needs nothing else.
        const chartUrl = buildChartUrl(business.name, business.telegramReportFrequency!, activityLabel, prior, current);
        await sendTelegramPhoto(chartUrl, { chatId: business.telegramChatId });

        business.telegramReportLastSentAt = now;
        await business.save();
        sentCount++;
      } catch (err) {
        console.error(`[telegram-business-report] failed for business ${business._id}:`, err);
      }
    }

    return NextResponse.json({ success: true, candidateCount: candidates.length, sentCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
