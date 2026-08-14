import Business from "@/models/Business";
import { sendTelegramMessage, sendTelegramPhoto } from "@/lib/telegram";
import { buildReportMessage, buildTrendChartUrl } from "@/lib/telegramReport";
import { getAllowedModuleKeys, getActivePlanKey } from "@/core/pricing/planAccess";

/**
 * Builds and sends one business's Telegram report (rich-text table + a
 * multi-point trend chart) to whichever of its group/personal chats are
 * configured, and stamps telegramReportLastSentAt. Shared by:
 *  - api/telegram/webhook's admin-only /sendreports command (the ACTUAL
 *    trigger mechanism now -- a super admin sends that command from an
 *    allowlisted chat and every due vendor gets sent their own report,
 *    per explicit direction "don't use vercel... let super admin give a
 *    command in bot"), and
 *  - api/telegram/webhook's /report command (a vendor pulling their own
 *    report on demand any time).
 * Still gated by the "telegram-reports" plan feature either way.
 */
export async function sendBusinessReport(
  business: { _id: unknown; name: string; operatingMode?: string; telegramChatId?: string; telegramPersonalChatId?: string; telegramReportFrequency?: string },
  opts?: { force?: boolean }
): Promise<{ sent: boolean; reason?: string }> {
  const businessId = String(business._id);
  const mode = (business.operatingMode || "SC") as "BRAND" | "SC" | "POS";
  const plan = await getActivePlanKey(businessId);
  const allowed = await getAllowedModuleKeys(mode, plan);
  if (allowed && !allowed.includes("telegram-reports")) {
    return { sent: false, reason: "plan does not include telegram-reports" };
  }

  const destinationChatIds = [business.telegramChatId, business.telegramPersonalChatId].filter(
    (id): id is string => !!id
  );
  if (destinationChatIds.length === 0) {
    return { sent: false, reason: "no chat linked" };
  }

  const frequency = business.telegramReportFrequency && business.telegramReportFrequency !== "NONE" ? business.telegramReportFrequency : "DAILY";
  const isSC = mode === "SC";
  const activityLabel = isSC ? "Workorders" : "Calls";
  const now = new Date();
  const { text } = await buildReportMessage(business.name, frequency, isSC, businessId, now);
  const chartUrl = await buildTrendChartUrl(business.name, frequency, activityLabel, businessId, isSC, now);

  for (const destChatId of destinationChatIds) {
    await sendTelegramMessage(text, { chatId: destChatId, parseMode: "HTML" });
    await sendTelegramPhoto(chartUrl, { chatId: destChatId });
  }

  await Business.findByIdAndUpdate(business._id, { telegramReportLastSentAt: now }).catch(() => {});

  return { sent: true };
}
