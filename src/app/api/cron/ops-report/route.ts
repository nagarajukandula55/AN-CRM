import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import CatalogChangeRequest from "@/models/CatalogChangeRequest";
import CrmJobSheet from "@/models/CrmJobSheet";
import CrmCall from "@/models/CrmCall";
import { sendTelegramMessage } from "@/lib/telegram";
import { callAIWithFailover } from "@/core/ai/orchestrator";

export const runtime = "nodejs";

const OPEN_JOBSHEET_STATUSES = ["CREATED", "REPAIR_STARTED", "REPAIR_IN_PROGRESS", "PART_PENDING", "REPAIR_COMPLETED"];
const OPEN_CALL_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "JOB_CREATED", "IN_PROGRESS"];

/**
 * Daily ops report: a handful of cheap countDocuments() metrics, summarized
 * into plain language via callAIWithFailover() and pushed to Telegram. Also
 * reachable via POST for manual "Send Ops Report Now" testing/admin use --
 * both verbs share the same gatherAndSend() logic below.
 *
 * Auth: standard Vercel Cron convention -- if CRON_SECRET is set, requires
 * `Authorization: Bearer ${CRON_SECRET}` (Vercel sends this automatically
 * for scheduled invocations). If CRON_SECRET is unset, allow through
 * unauthenticated, matching sync-trackings' current (auth-less) behavior.
 */
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function gatherAndSend() {
  await connectDB();

  const [pendingCatalogRequests, openJobSheets, openCalls] = await Promise.all([
    CatalogChangeRequest.countDocuments({ status: "PENDING" }),
    CrmJobSheet.countDocuments({ status: { $in: OPEN_JOBSHEET_STATUSES } }),
    CrmCall.countDocuments({ status: { $in: OPEN_CALL_STATUSES } }),
  ]);

  const metrics = {
    pendingCatalogRequests,
    openJobSheets,
    openCalls,
  };

  const rawSummary = [
    `Pending catalog change requests: ${pendingCatalogRequests}`,
    `Open job sheets (in repair/awaiting parts): ${openJobSheets}`,
    `Open CRM calls (not yet closed): ${openCalls}`,
  ].join("\n");

  let finalText = `Daily Ops Report\n\n${rawSummary}`;
  let providerUsed: string | null = null;

  const aiResult = await callAIWithFailover(
    rawSummary,
    "You are a concise business-operations assistant. Turn these raw metrics into a short, friendly 3-5 sentence status update for a business owner reading it on their phone. No preamble, just the summary."
  );

  if ("text" in aiResult) {
    finalText = aiResult.text;
    providerUsed = aiResult.providerUsed;
  } else {
    console.warn("[ops-report] AI summary unavailable, falling back to raw metrics:", aiResult.error);
  }

  const sent = await sendTelegramMessage(finalText);

  return {
    success: true,
    metrics,
    aiProviderUsed: providerUsed,
    telegramSent: sent,
  };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await gatherAndSend();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message });
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await gatherAndSend();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message });
  }
}
