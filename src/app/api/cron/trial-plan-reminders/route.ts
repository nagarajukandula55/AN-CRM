/**
 * GET /api/cron/trial-plan-reminders — daily "choose & purchase a plan"
 * Telegram nudge for every vendor who has never actually paid (no PAID
 * VendorBillingInvoice), starting from day 1 of their trial, not just
 * once it's about to expire. Runs via api/cron/run-all -- see
 * lib/cronRunner.ts. Complements the always-visible right-edge reminder
 * in the vendor portal itself (TrialPlanBanner.tsx) with a channel that
 * reaches them even when they aren't logged in, per explicit direction
 * ("give reminder from day 1 itself daily basis give reminder").
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorSubscription from "@/models/VendorSubscription";
import VendorBillingInvoice from "@/models/VendorBillingInvoice";
import VendorProfile from "@/models/VendorProfile";
import { sendTelegramMessage } from "@/lib/telegram";
import { computeStatus } from "@/core/billing/billing.service";

const MIN_INTERVAL_HOURS = 20; // once a day, same slack convention as the other daily crons

function isDue(lastSentAt: Date | null | undefined, now: Date): boolean {
  if (!lastSentAt) return true;
  return (now.getTime() - new Date(lastSentAt).getTime()) / 3600000 >= MIN_INTERVAL_HOURS;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const now = new Date();
    const subscriptions = await VendorSubscription.find({})
      .select("vendorId planName currentPeriodEnd trialReminderLastSentAt")
      .lean();

    let sentCount = 0;
    let skippedCount = 0;
    const failures: string[] = [];

    for (const sub of subscriptions) {
      try {
        if (!isDue((sub as any).trialReminderLastSentAt, now)) {
          skippedCount++;
          continue;
        }
        const hasPaid = await VendorBillingInvoice.exists({ vendorId: sub.vendorId, status: "PAID" });
        if (hasPaid) {
          skippedCount++;
          continue;
        }

        const vendor = await VendorProfile.findById(sub.vendorId).select("companyName telegramPersonalChatId").lean<any>();
        if (!vendor?.telegramPersonalChatId) {
          skippedCount++;
          continue;
        }

        const status = computeStatus(sub as any);
        const end = (sub as any).currentPeriodEnd ? new Date((sub as any).currentPeriodEnd) : null;
        const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000)) : null;
        // Exact expiry date+time, not just a day count -- per explicit
        // direction ("ensure to have those alerts show with their expiry
        // time also").
        const expiryLabel = end
          ? end.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
          : null;

        const text =
          status === "EXPIRED" || status === "NOT_SET"
            ? `⏰ <b>Your free trial has ended</b>\n${vendor.companyName || ""}\n\nChoose and purchase a plan to keep using your portal: Billing &amp; Plan in your sidebar.`
            : `⏰ <b>Free trial reminder</b>\n${vendor.companyName || ""}\n\nYou're on a free trial${daysLeft !== null ? ` — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : ""}${expiryLabel ? ` (expires ${expiryLabel})` : ""}. Choose and purchase a plan anytime from Billing &amp; Plan in your sidebar to keep uninterrupted access.`;

        const ok = await sendTelegramMessage(text, { chatId: vendor.telegramPersonalChatId });
        if (ok) {
          await VendorSubscription.updateOne({ vendorId: sub.vendorId }, { trialReminderLastSentAt: now });
          sentCount++;
        } else {
          skippedCount++;
        }
      } catch (err: any) {
        failures.push(`${sub.vendorId}: ${err?.message || "unknown error"}`);
      }
    }

    return NextResponse.json({ success: true, checked: subscriptions.length, sentCount, skippedCount, failures });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
