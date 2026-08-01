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
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";
import SalesInvoice from "@/models/SalesInvoice";
import CrmCall from "@/models/CrmCall";
import CrmJobSheet from "@/models/CrmJobSheet";
import { getAllowedModuleKeys, getActivePlanKey } from "@/core/pricing/planAccess";
import { sendTelegramMessage, sendTelegramPhoto } from "@/lib/telegram";

function isDue(frequency: string, lastSentAt: Date | undefined, now: Date): boolean {
  if (!lastSentAt) return true;
  const hoursSince = (now.getTime() - new Date(lastSentAt).getTime()) / 3600000;
  if (frequency === "DAILY") return hoursSince >= 20; // small slack around exact 24h boundary
  if (frequency === "WEEKLY") return hoursSince >= 24 * 6.5;
  if (frequency === "MONTHLY") return hoursSince >= 24 * 27;
  return false;
}

function periodStart(frequency: string, now: Date): Date {
  const start = new Date(now);
  if (frequency === "DAILY") start.setDate(start.getDate() - 1);
  else if (frequency === "WEEKLY") start.setDate(start.getDate() - 7);
  else start.setMonth(start.getMonth() - 1);
  return start;
}

const fmtINR = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

async function computePeriodNumbers(businessId: string, isSC: boolean, from: Date, to: Date) {
  const businessObjectId = new mongoose.Types.ObjectId(businessId);
  const [revenueAgg, callCount] = await Promise.all([
    SalesInvoice.aggregate([
      { $match: { businessId: businessObjectId, isDeleted: { $ne: true }, status: "PAID", createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: null, sum: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
    ]),
    isSC
      ? CrmJobSheet.countDocuments({ businessId: businessObjectId, isDeleted: { $ne: true }, createdAt: { $gte: from, $lt: to } })
      : CrmCall.countDocuments({ businessId: businessObjectId, createdAt: { $gte: from, $lt: to } }),
  ]);
  return {
    revenue: revenueAgg?.[0]?.sum || 0,
    invoices: revenueAgg?.[0]?.count || 0,
    activity: callCount || 0,
  };
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
        const from = periodStart(business.telegramReportFrequency!, now);
        const priorFrom = periodStart(business.telegramReportFrequency!, from);

        const [current, prior] = await Promise.all([
          computePeriodNumbers(String(business._id), isSC, from, now),
          computePeriodNumbers(String(business._id), isSC, priorFrom, from),
        ]);

        const activityLabel = isSC ? "Workorders" : "Calls";
        const changePct = prior.revenue > 0 ? (((current.revenue - prior.revenue) / prior.revenue) * 100).toFixed(1) : "n/a";

        const table = [
          `<b>${business.name} — ${business.telegramReportFrequency} Report</b>`,
          "",
          "<pre>",
          `Revenue      ${fmtINR(current.revenue).padEnd(14)} (prior ${fmtINR(prior.revenue)})`,
          `Invoices     ${String(current.invoices).padEnd(14)} (prior ${prior.invoices})`,
          `${activityLabel.padEnd(12)} ${String(current.activity).padEnd(14)} (prior ${prior.activity})`,
          `Change       ${changePct}%`,
          "</pre>",
        ].join("\n");

        await sendTelegramMessage(table, { chatId: business.telegramChatId, parseMode: "HTML" });

        // QuickChart renders a Chart.js config into a PNG server-side --
        // https://quickchart.io/documentation/ -- no API key needed for
        // this volume, and the whole config travels as one URL, so
        // Telegram's sendPhoto (which fetches by URL) needs nothing else.
        const chartConfig = {
          type: "bar",
          data: {
            labels: ["Prior period", "This period"],
            datasets: [
              { label: "Revenue (Rs)", data: [prior.revenue, current.revenue], backgroundColor: "#5B3DF5" },
              { label: activityLabel, data: [prior.activity, current.activity], backgroundColor: "#22D3EE" },
            ],
          },
          options: { plugins: { title: { display: true, text: `${business.name} — ${business.telegramReportFrequency} trend` } } },
        };
        const chartUrl = `https://quickchart.io/chart?width=600&height=350&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
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
