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
import { runReport } from "@/core/reports/runReport";
import { DATA_SOURCES } from "@/core/reports/dataSources";
import { sendGenericEmail } from "@/services/email/resend.service";

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
      if (!report.schedule.recipientEmails?.length) continue;
      try {
        const result = await runReport(report);
        const html = `<h2>${report.name}</h2><p>${DATA_SOURCES[report.dataSource]?.label} — ${result.rows.length} rows</p>${rowsToHtmlTable(result.rows)}`;
        await sendGenericEmail({
          to: report.schedule.recipientEmails,
          subject: `Scheduled report: ${report.name}`,
          html,
          businessId: report.businessId.toString(),
        });
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
