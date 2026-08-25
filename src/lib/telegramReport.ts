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
import TelegramMessageTemplate from "@/models/TelegramMessageTemplate";
import { renderTelegramCard, applyCardStyle, FOOTER_TONE_EMOJI } from "@/core/telegram/renderCard";

export function periodStart(frequency: string, now: Date): Date {
  const start = new Date(now);
  if (frequency === "DAILY") start.setDate(start.getDate() - 1);
  else if (frequency === "WEEKLY") start.setDate(start.getDate() - 7);
  else if (frequency === "YEARLY") start.setFullYear(start.getFullYear() - 1);
  else start.setMonth(start.getMonth() - 1);
  return start;
}

// 1st of `now`'s calendar month at 00:00 -- start of the "month so far"
// window a Daily report also shows alongside just-today's numbers.
export function monthToDateStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
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
    // Per-status breakdown for the period -- CrmJobSheet.status is the
    // same lifecycle for BOTH a Workorder (SC) and a Call (BRAND/POS,
    // where "activity" is labeled Calls instead but is still counted off
    // the same model/status field) -- used to be SC-only, which meant a
    // non-SC vendor's /today never showed any status breakdown at all.
    CrmJobSheet.aggregate([
      { $match: { businessId: businessObjectId, ...vendorMatch, isDeleted: { $ne: true }, createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
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

// Shared by the daily block, the "Month So Far" block, and /today (see
// api/telegram/webhook/route.ts) -- a per-status <pre> table from a
// byStatus count map, empty string when there's nothing to show (skips an
// all-zero table on a quiet day). Used to be SC-only; heading now defaults
// per activity label so a non-SC vendor sees "Calls by Status" instead of
// either "Workorders by Status" or nothing at all.
export function renderWorkorderBreakdown(byStatus: Record<string, number>, activityLabel: string, heading?: string): string {
  const rows = WORKORDER_STATUSES
    .map((s) => ({ status: s, count: byStatus[s] || 0 }))
    .filter((r) => r.count > 0);
  if (rows.length === 0) return "";
  const lines = [`<b>${heading || `${activityLabel} by Status`}</b>`, "<pre>"];
  for (const r of rows) {
    lines.push(`${statusLabel(r.status).padEnd(18)} ${String(r.count).padStart(4)}`);
  }
  lines.push("</pre>");
  return lines.join("\n");
}

// Default look per frequency -- distinct icon/title/footer wording so
// Daily/Weekly/Monthly don't just look like the same card with a different
// word swapped in, even before a super admin customizes anything (Settings
// > Platform > Report Templates still overrides all of this per key).
const FREQUENCY_META: Record<string, { emoji: string; label: string; tableTitle: string; compareVerb: string }> = {
  DAILY: { emoji: "📊", label: "Daily Report", tableTitle: "Today", compareVerb: "vs yesterday" },
  WEEKLY: { emoji: "📈", label: "Weekly Report", tableTitle: "This Week", compareVerb: "vs last week" },
  MONTHLY: { emoji: "🗓️", label: "Monthly Report", tableTitle: "This Month", compareVerb: "vs last month" },
  YEARLY: { emoji: "📅", label: "Yearly Report", tableTitle: "This Year", compareVerb: "vs last year" },
};

export async function buildReportMessage(
  businessName: string,
  frequency: string,
  isSC: boolean,
  businessId: string,
  now: Date,
  vendorId?: string,
  vendorName?: string
) {
  const from = periodStart(frequency, now);
  const priorFrom = periodStart(frequency, from);
  const isDaily = frequency === "DAILY";

  const [current, prior, mtd] = await Promise.all([
    computePeriodNumbers(businessId, isSC, from, now, vendorId),
    computePeriodNumbers(businessId, isSC, priorFrom, from, vendorId),
    // Month-so-far numbers, only needed for a Daily report -- see this
    // function's own comment on why Weekly/Monthly skip it.
    isDaily ? computePeriodNumbers(businessId, isSC, monthToDateStart(now), now, vendorId) : Promise.resolve(null),
  ]);

  const activityLabel = isSC ? "Workorders" : "Calls";
  const changePct = prior.revenue > 0 ? (((current.revenue - prior.revenue) / prior.revenue) * 100).toFixed(1) : "n/a";

  const workorderBreakdown = renderWorkorderBreakdown(current.byStatus, activityLabel);
  const mtdWorkorderBreakdown = mtd ? renderWorkorderBreakdown(mtd.byStatus, activityLabel, `Month So Far — ${activityLabel} by Status`) : "";

  // Super-admin-configurable wording + look for THIS frequency's report
  // (Settings > Platform > Report Templates > Daily/Weekly/Monthly) --
  // split from one shared BUSINESS_REPORT key so each frequency can look
  // completely different (own icon, own footer tone/text, own wording),
  // per explicit direction to redesign reports "one by one". Disabled ->
  // no report for this frequency at all (empty text, caller skips the send).
  const reportKey = `${frequency}_REPORT`;
  const template = await TelegramMessageTemplate.findOne({ key: reportKey }).lean<any>();
  if (template?.enabled === false) {
    return { text: "", current, prior };
  }

  const tokens: Record<string, string> = {
    businessName, vendorName: vendorName || "", vendorId: vendorId || "",
    date: now.toLocaleDateString("en-IN"), frequency,
    revenue: fmtINR(current.revenue), priorRevenue: fmtINR(prior.revenue),
    invoices: String(current.invoices), priorInvoices: String(prior.invoices),
    activityLabel, activity: String(current.activity), priorActivity: String(prior.activity),
    changePct: `${changePct}%`, workorderBreakdown,
    mtdRevenue: mtd ? fmtINR(mtd.revenue) : "", mtdInvoices: mtd ? String(mtd.invoices) : "",
    mtdActivity: mtd ? String(mtd.activity) : "", mtdWorkorderBreakdown,
  };
  const renderTokens = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) => tokens[name] ?? "");

  const meta = FREQUENCY_META[frequency] || FREQUENCY_META.DAILY;

  if (template?.template && template.template !== "(disabled)") {
    const text = applyCardStyle(renderTokens(template.template), {
      icon: template.icon || meta.emoji, title: `${businessName} — ${meta.label}`, layout: template.layout,
      footerTone: template.footerTone, footerText: template.footerText ? renderTokens(template.footerText) : "",
    });
    return { text, current, prior };
  }

  // Boxed-card look (emoji title, padded label/value table, confirmation
  // footer) -- see core/telegram/renderCard.ts. icon/footer are overridable
  // from the saved template even when its wording itself is left blank
  // (i.e. "keep the built-in layout, just change the icon/footer").
  const changeUp = changePct !== "n/a" && Number(changePct) >= 0;
  let text = renderTelegramCard({
    emoji: template?.icon || meta.emoji,
    title: `${businessName} — ${meta.label}`,
    tableTitle: meta.tableTitle,
    rows: [
      { label: "Revenue", value: `${fmtINR(current.revenue)}  (prior ${fmtINR(prior.revenue)})` },
      { label: "Invoices", value: `${current.invoices}  (prior ${prior.invoices})` },
      { label: activityLabel, value: `${current.activity}  (prior ${prior.activity})` },
      { label: "Change", value: `${changePct}%` },
    ],
    footer: template?.footerText
      ? `${FOOTER_TONE_EMOJI[template.footerTone || "NONE"] ? `${FOOTER_TONE_EMOJI[template.footerTone || "NONE"]} ` : ""}${renderTokens(template.footerText)}`
      : `${changeUp ? "✅" : "⚠️"} Revenue ${changeUp ? "up" : "down"} ${meta.compareVerb}`,
  });

  // Per-status workorder table -- SC only, and only when there's at
  // least one workorder in the period (an all-zero table for a quiet
  // day/week is just noise). Per explicit direction ("Richtext format
  // tables of Daily, Weekly and monthly summaries of Workorders with
  // Statuses and Revenue details").
  if (workorderBreakdown) text += `\n\n${workorderBreakdown}`;

  // Daily report also gets a second "Month So Far" block -- same shape as
  // the daily one, no prior-period comparison (there's no clean "prior
  // month so far" to compare against a partial month). Per explicit
  // direction ("first give day data and also month so far summary data").
  if (mtd) {
    const monthName = now.toLocaleDateString("en-IN", { month: "long" });
    text += `\n\n${renderTelegramCard({
      emoji: "🗓️",
      title: `Month So Far (${monthName})`,
      rows: [
        { label: "Revenue", value: fmtINR(mtd.revenue) },
        { label: "Invoices", value: String(mtd.invoices) },
        { label: activityLabel, value: String(mtd.activity) },
      ],
    })}`;
    if (mtdWorkorderBreakdown) text += `\n\n${mtdWorkorderBreakdown}`;
  }

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

// One period-length back per point, one DAILY interval each (daily report:
// 7 days; weekly report: 6 weeks of daily points would be noisy, so weekly
// reports plot 6 weeks; monthly reports plot 6 months) -- a real trend
// line instead of just "prior vs. current", per explicit direction ("best
// possible way rich texts and graphs and analytic data").
const TREND_POINTS: Record<string, { count: number; stepDays: number; labelFmt: (d: Date) => string }> = {
  DAILY: { count: 7, stepDays: 1, labelFmt: (d) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) },
  WEEKLY: { count: 6, stepDays: 7, labelFmt: (d) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) },
  MONTHLY: { count: 6, stepDays: 30, labelFmt: (d) => d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) },
  YEARLY: { count: 5, stepDays: 365, labelFmt: (d) => d.toLocaleDateString("en-IN", { year: "numeric" }) },
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
      plugins: { title: { display: true, text: `${businessName} — last ${cfg.count} ${frequency === "DAILY" ? "days" : frequency === "WEEKLY" ? "weeks" : frequency === "YEARLY" ? "years" : "months"}` } },
      scales: {
        y: { type: "linear", position: "left", title: { display: true, text: "Revenue (Rs)" } },
        y1: { type: "linear", position: "right", title: { display: true, text: activityLabel }, grid: { drawOnChartArea: false } },
      },
    },
  };
  return `https://quickchart.io/chart?width=700&height=380&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
}
