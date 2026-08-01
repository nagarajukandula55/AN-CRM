/**
 * Shared business-report math for Telegram, used by both the scheduled
 * cron (api/cron/telegram-business-report) and the on-demand /report and
 * /today bot commands (api/telegram/webhook) -- same period-over-period
 * revenue/activity numbers and message formatting either way, so an
 * on-demand /report a user sends from the bot looks identical to the
 * automatic one they'd otherwise wait for.
 */
import mongoose from "mongoose";
import SalesInvoice from "@/models/SalesInvoice";
import CrmCall from "@/models/CrmCall";
import CrmJobSheet from "@/models/CrmJobSheet";

export function periodStart(frequency: string, now: Date): Date {
  const start = new Date(now);
  if (frequency === "DAILY") start.setDate(start.getDate() - 1);
  else if (frequency === "WEEKLY") start.setDate(start.getDate() - 7);
  else start.setMonth(start.getMonth() - 1);
  return start;
}

export const fmtINR = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

export async function computePeriodNumbers(businessId: string, isSC: boolean, from: Date, to: Date) {
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

export async function buildReportMessage(businessName: string, frequency: string, isSC: boolean, businessId: string, now: Date) {
  const from = periodStart(frequency, now);
  const priorFrom = periodStart(frequency, from);

  const [current, prior] = await Promise.all([
    computePeriodNumbers(businessId, isSC, from, now),
    computePeriodNumbers(businessId, isSC, priorFrom, from),
  ]);

  const activityLabel = isSC ? "Workorders" : "Calls";
  const changePct = prior.revenue > 0 ? (((current.revenue - prior.revenue) / prior.revenue) * 100).toFixed(1) : "n/a";

  const text = [
    `<b>${businessName} — ${frequency} Report</b>`,
    "",
    "<pre>",
    `Revenue      ${fmtINR(current.revenue).padEnd(14)} (prior ${fmtINR(prior.revenue)})`,
    `Invoices     ${String(current.invoices).padEnd(14)} (prior ${prior.invoices})`,
    `${activityLabel.padEnd(12)} ${String(current.activity).padEnd(14)} (prior ${prior.activity})`,
    `Change       ${changePct}%`,
    "</pre>",
  ].join("\n");

  return { text, current, prior };
}

export function buildChartUrl(businessName: string, frequency: string, activityLabel: string, prior: { revenue: number; activity: number }, current: { revenue: number; activity: number }) {
  const chartConfig = {
    type: "bar",
    data: {
      labels: ["Prior period", "This period"],
      datasets: [
        { label: "Revenue (Rs)", data: [prior.revenue, current.revenue], backgroundColor: "#5B3DF5" },
        { label: activityLabel, data: [prior.activity, current.activity], backgroundColor: "#22D3EE" },
      ],
    },
    options: { plugins: { title: { display: true, text: `${businessName} — ${frequency} trend` } } },
  };
  return `https://quickchart.io/chart?width=600&height=350&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
}
