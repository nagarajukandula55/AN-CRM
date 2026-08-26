/**
 * GET /api/cron/run-scheduled-reports — runs every ReportDefinition whose
 * schedule is due, emails the result (HTML table) to its recipients, and
 * advances nextRunAt. Vercel Cron, daily (see vercel.json) -- a report
 * scheduled WEEKLY/MONTHLY simply only actually sends when its nextRunAt
 * has passed, checked every day.
 *
 * Same CRON_SECRET convention as every other cron route (see api/cron/
 * check-subscriptions's comment) -- reachable without a session because
 * "/api/cron/" is a public middleware prefix.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ReportDefinition from "@/models/ReportDefinition";
import Business from "@/models/Business";
import { runReport } from "@/core/reports/runReport";
import { DATA_SOURCES } from "@/core/reports/dataSources";
import { sendGenericEmail } from "@/services/email/resend.service";
import { sendTelegramMessage, sendTelegramPhoto } from "@/lib/telegram";
import { applyCardStyle } from "@/core/telegram/renderCard";

function nextRunFor(frequency: string, from: Date): Date {
  const next = new Date(from);
  if (frequency === "DAILY") next.setDate(next.getDate() + 1);
  else if (frequency === "WEEKLY") next.setDate(next.getDate() + 7);
  else if (frequency === "MONTHLY") next.setMonth(next.getMonth() + 1);
  return next;
}

function rowsToHtmlTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "<p>No data for this period.</p>";
  const columns = Object.keys(rows[0]).filter((k) => k !== "_id");
  const header = columns.map((c) => `<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">${c}</th>`).join("");
  const body = rows
    .slice(0, 200)
    .map(
      (row) =>
        `<tr>${columns.map((c) => `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${String((row as any)[c] ?? "")}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

// Telegram messages have no room for a full HTML table -- summarize the
// first handful of rows as plain lines instead, same fields the email
// table would show, just capped much lower (4096-char message limit).
function rowsToTelegramText(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "No data for this period.";
  const columns = Object.keys(rows[0]).filter((k) => k !== "_id").slice(0, 4);
  return rows
    .slice(0, 15)
    .map((row) => columns.map((c) => `${c}: ${String((row as any)[c] ?? "")}`).join(", "))
    .join("\n");
}

// Best-effort bar chart from whatever tabular data this report produced --
// generic report data has no fixed shape (unlike the vendor business
// report's known revenue/activity fields), so this just finds the first
// string-ish column to use as a label and the first numeric column to
// plot, skipping the chart entirely when no numeric column exists. Same
// QuickChart approach as lib/telegramReport.ts's buildChartUrl.
function rowsToChartUrl(rows: Record<string, unknown>[], title: string): string | null {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0]).filter((k) => k !== "_id");
  const labelCol = columns.find((c) => typeof rows[0][c] === "string");
  const valueCol = columns.find((c) => typeof rows[0][c] === "number");
  if (!valueCol) return null;
  const points = rows.slice(0, 20);
  const chartConfig = {
    type: "bar",
    data: {
      labels: points.map((r, i) => (labelCol ? String(r[labelCol] ?? `#${i + 1}`) : `#${i + 1}`)),
      datasets: [{ label: valueCol, data: points.map((r) => Number(r[valueCol]) || 0), backgroundColor: "#5B3DF5" }],
    },
    options: { plugins: { title: { display: true, text: title } } },
  };
  return `https://quickchart.io/chart?width=600&height=350&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const now = new Date();
    const due = await ReportDefinition.find({
      "schedule.frequency": { $ne: "NONE" },
      $or: [{ "schedule.nextRunAt": { $lte: now } }, { "schedule.nextRunAt": { $exists: false } }],
    });

    let sentCount = 0;
    for (const report of due) {
      const wantsEmail = !!report.schedule.recipientEmails?.length;
      const wantsTelegram = !!report.schedule.sendToTelegram;
      if (!wantsEmail && !wantsTelegram) continue;
      try {
        const result = await runReport(report, (report as any).vendorId ? String((report as any).vendorId) : null);

        if (wantsEmail) {
          const html = `<h2>${report.name}</h2><p>${DATA_SOURCES[report.dataSource]?.label} — ${result.rows.length} rows</p>${rowsToHtmlTable(result.rows)}`;
          await sendGenericEmail({
            to: report.schedule.recipientEmails,
            subject: `Scheduled report: ${report.name}`,
            html,
            businessId: report.businessId.toString(),
          });
        }

        if (wantsTelegram) {
          const business = await Business.findById(report.businessId).select("telegramChatId").lean();
          const chatId = (business as any)?.telegramChatId;
          if (chatId) {
            const body = `<pre>${rowsToTelegramText(result.rows)}</pre>`;
            const text = applyCardStyle(body, {
              icon: "📋",
              title: report.name,
              layout: "CARD",
              footerTone: "INFO",
              footerText: `${DATA_SOURCES[report.dataSource]?.label} — ${result.rows.length} rows (${report.schedule.frequency.toLowerCase()})`,
            });
            await sendTelegramMessage(text, { chatId, parseMode: "HTML" });

            const chartUrl = rowsToChartUrl(result.rows, report.name);
            if (chartUrl) await sendTelegramPhoto(chartUrl, { chatId, caption: `📊 ${report.name}` });
          }
        }

        sentCount++;
      } catch (err) {
        console.error(`Scheduled report ${report._id} failed:`, err);
      }
      report.schedule.lastRunAt = now;
      report.schedule.nextRunAt = nextRunFor(report.schedule.frequency, now);
      await report.save();
    }

    return NextResponse.json({ success: true, dueCount: due.length, sentCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
