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
import CrmJobSheet from "@/models/CrmJobSheet";

export function periodStart(frequency: string, now: Date): Date {
  const start = new Date(now);
  if (frequency === "DAILY") start.setDate(start.getDate() - 1);
  else if (frequency === "WEEKLY") start.setDate(start.getDate() - 7);
  else start.setMonth(start.getMonth() - 1);
  return start;
}

export const fmtINR = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

// Every CrmJobSheet.status value, in the order they should list in the
// report -- see models/CrmJobSheet.ts for the canonical lifecycle.
const WORKORDER_STATUSES = [
  "CREATED",
  "REPAIR_STARTED",
  "REPAIR_IN_PROGRESS",
  "PART_PENDING",
  "REPAIR_COMPLETED",
  "CLOSED",
  "CANCELLED",
] as const;

export async function computePeriodNumbers(businessId: string, isSC: boolean, from: Date, to: Date, vendorId?: string) {
  const businessObjectId = new mongoose.Types.ObjectId(businessId);
  // Now that many vendors can share one Business (see VendorProfile's own
  // telegram* fields comment), a report has to filter by vendorId too --
  // without it, every vendor's report would mix in every OTHER vendor's
  // revenue/workorders under the same shared business, which defeats the
  // entire point of a per-vendor group.
  const vendorMatch = vendorId ? { vendorId: new mongoose.Types.ObjectId(vendorId) } : {};
  const [revenueAgg, jobSheetCount, statusAgg] = await Promise.all([
    SalesInvoice.aggregate([
      { $match: { businessId: businessObjectId, ...vendorMatch, isDeleted: { $ne: true }, status: "PAID", createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: null, sum: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
    ]),
    CrmJobSheet.countDocuments({ businessId: businessObjectId, ...vendorMatch, isDeleted: { $ne: true }, createdAt: { $gte: from, $lt: to } }),
    // Per-status workorder breakdown for the period -- SC only (see
    // buildReportMessage's own comment on why non-SC never had a
    // workorder concept). Skipped entirely for non-SC to avoid an
    // unnecessary aggregate.
    isSC
      ? CrmJobSheet.aggregate([
          { $match: { businessId: businessObjectId, ...vendorMatch, isDeleted: { $ne: true }, createdAt: { $gte: from, $lt: to } } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
  ]);
  const byStatus: Record<string, number> = {};
  for (const row of statusAgg as any[]) byStatus[row._id] = row.count;
  return {
    revenue: revenueAgg?.[0]?.sum || 0,
    invoices: revenueAgg?.[0]?.count || 0,
    activity: jobSheetCount || 0,
    byStatus,
  };
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function buildReportMessage(businessName: string, frequency: string, isSC: boolean, businessId: string, now: Date, vendorId?: string) {
  const from = periodStart(frequency, now);
  const priorFrom = periodStart(frequency, from);

  const [current, prior] = await Promise.all([
    computePeriodNumbers(businessId, isSC, from, now, vendorId),
    computePeriodNumbers(businessId, isSC, priorFrom, from, vendorId),
  ]);

  const activityLabel = isSC ? "Workorders" : "Calls";
  const changePct = prior.revenue > 0 ? (((current.revenue - prior.revenue) / prior.revenue) * 100).toFixed(1) : "n/a";

  const lines = [
    `<b>${businessName} — ${frequency} Report</b>`,
    "",
    "<pre>",
    `Revenue      ${fmtINR(current.revenue).padEnd(14)} (prior ${fmtINR(prior.revenue)})`,
    `Invoices     ${String(current.invoices).padEnd(14)} (prior ${prior.invoices})`,
    `${activityLabel.padEnd(12)} ${String(current.activity).padEnd(14)} (prior ${prior.activity})`,
    `Change       ${changePct}%`,
    "</pre>",
  ];

  // Per-status workorder table -- SC only, and only when there's at
  // least one workorder in the period (an all-zero table for a quiet
  // day/week is just noise). Per explicit direction ("Richtext format
  // tables of Daily, Weekly and monthly summaries of Workorders with
  // Statuses and Revenue details").
  if (isSC) {
    const rows = WORKORDER_STATUSES
      .map((s) => ({ status: s, count: current.byStatus[s] || 0 }))
      .filter((r) => r.count > 0);
    if (rows.length > 0) {
      lines.push("", "<b>Workorders by Status</b>", "<pre>");
      for (const r of rows) {
        lines.push(`${statusLabel(r.status).padEnd(18)} ${String(r.count).padStart(4)}`);
      }
      lines.push("</pre>");
    }
  }

  return { text: lines.join("\n"), current, prior };
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

// One period-length back per point, one DAILY interval each (daily report:
// 7 days; weekly report: 6 weeks of daily points would be noisy, so weekly
// reports plot 6 weeks; monthly reports plot 6 months) -- a real trend
// line instead of just "prior vs. current", per explicit direction ("best
// possible way rich texts and graphs and analytic data").
const TREND_POINTS: Record<string, { count: number; stepDays: number; labelFmt: (d: Date) => string }> = {
  DAILY: { count: 7, stepDays: 1, labelFmt: (d) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) },
  WEEKLY: { count: 6, stepDays: 7, labelFmt: (d) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) },
  MONTHLY: { count: 6, stepDays: 30, labelFmt: (d) => d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) },
};

export async function buildTrendChartUrl(businessName: string, frequency: string, activityLabel: string, businessId: string, isSC: boolean, now: Date, vendorId?: string): Promise<string> {
  const cfg = TREND_POINTS[frequency] || TREND_POINTS.DAILY;
  const points: { label: string; revenue: number; activity: number }[] = [];
  let periodEnd = new Date(now);
  for (let i = 0; i < cfg.count; i++) {
    const periodStartDate = new Date(periodEnd);
    periodStartDate.setDate(periodStartDate.getDate() - cfg.stepDays);
    const nums = await computePeriodNumbers(businessId, isSC, periodStartDate, periodEnd, vendorId);
    points.unshift({ label: cfg.labelFmt(periodStartDate), revenue: nums.revenue, activity: nums.activity });
    periodEnd = periodStartDate;
  }

  const chartConfig = {
    type: "line",
    data: {
      labels: points.map((p) => p.label),
      datasets: [
        { label: "Revenue (Rs)", data: points.map((p) => p.revenue), borderColor: "#5B3DF5", backgroundColor: "#5B3DF533", fill: true, yAxisID: "y", tension: 0.3 },
        { label: activityLabel, data: points.map((p) => p.activity), borderColor: "#22D3EE", backgroundColor: "#22D3EE33", fill: true, yAxisID: "y1", tension: 0.3 },
      ],
    },
    options: {
      plugins: { title: { display: true, text: `${businessName} — last ${cfg.count} ${frequency === "DAILY" ? "days" : frequency === "WEEKLY" ? "weeks" : "months"}` } },
      scales: {
        y: { type: "linear", position: "left", title: { display: true, text: "Revenue (Rs)" } },
        y1: { type: "linear", position: "right", title: { display: true, text: activityLabel }, grid: { drawOnChartArea: false } },
      },
    },
  };
  return `https://quickchart.io/chart?width=700&height=380&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
}
