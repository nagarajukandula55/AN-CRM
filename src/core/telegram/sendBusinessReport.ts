import VendorProfile from "@/models/VendorProfile";
import Business from "@/models/Business";
import { sendTelegramMessage, sendTelegramPhoto } from "@/lib/telegram";
import { buildReportMessage, buildTrendChartUrl } from "@/lib/telegramReport";
import { getAllowedModuleKeys, getActivePlanKey } from "@/core/pricing/planAccess";
import { resolveVendorChatConfig } from "./resolveVendorChatConfig";

/**
 * Builds and sends one VENDOR's Telegram report (rich-text table + a
 * multi-point trend chart), scoped to that vendor's own data (not mixed
 * in with every other vendor sharing the same Business) -- see
 * lib/telegramReport.ts's vendorId filter. Sends to whichever of its
 * group/personal chats are effectively configured (own, or inherited from
 * a parent vendor -- see resolveVendorChatConfig), and stamps
 * telegramReportLastSentAt on the vendor itself. Shared by:
 *  - api/telegram/webhook's admin-only /sendreports command and its
 *    natural-language equivalent (a super admin sends that from an
 *    allowlisted chat and every vendor with a linked chat gets their own
 *    report sent to their own chat(s) immediately), and
 *  - api/telegram/webhook's /report command (a vendor pulling their own
 *    report on demand any time).
 * Still gated by the "telegram-reports" plan feature (checked against the
 * vendor's own Business, since plans are still sold at the Business
 * level today).
 */
export async function sendVendorBusinessReport(
  vendorObjectId: string,
  opts?: { force?: boolean }
): Promise<{ sent: boolean; reason?: string }> {
  const vendor = await resolveVendorChatConfig(vendorObjectId);
  if (!vendor) return { sent: false, reason: "vendor not found" };
  if (!vendor.businessId) return { sent: false, reason: "vendor has no business on file" };

  const business = await Business.findById(vendor.businessId).select("name operatingMode").lean<any>();
  if (!business) return { sent: false, reason: "business not found" };

  const mode = (business.operatingMode || "SC") as "SC";
  const plan = await getActivePlanKey(vendor.businessId);
  const allowed = await getAllowedModuleKeys(mode, plan);
  if (allowed && !allowed.includes("telegram-reports")) {
    return { sent: false, reason: "plan does not include telegram-reports" };
  }

  const destinationChatIds = [vendor.telegramChatId, vendor.telegramPersonalChatId].filter(Boolean);
  if (destinationChatIds.length === 0) {
    return { sent: false, reason: "no chat linked" };
  }

  const frequency = vendor.telegramReportFrequency && vendor.telegramReportFrequency !== "NONE" ? vendor.telegramReportFrequency : "DAILY";
  const isSC = mode === "SC";
  const activityLabel = isSC ? "Workorders" : "Calls";
  const now = new Date();
  const reportTitle = vendor.vendorName || business.name;
  const { text } = await buildReportMessage(reportTitle, frequency, isSC, vendor.businessId, now, vendor.vendorObjectId, vendor.vendorName);
  if (!text) {
    // Super admin disabled this frequency's report template entirely (see
    // buildReportMessage) -- distinct from "no chat linked" above.
    return { sent: false, reason: `${frequency.toLowerCase()} report disabled` };
  }
  const chartUrl = await buildTrendChartUrl(reportTitle, frequency, activityLabel, vendor.businessId, isSC, now, vendor.vendorObjectId);

  const chartCaption = `${frequency === "DAILY" ? "📊" : frequency === "WEEKLY" ? "📈" : frequency === "YEARLY" ? "📅" : "🗓️"} ${reportTitle} — trend`;
  for (const destChatId of destinationChatIds) {
    await sendTelegramMessage(text, { chatId: destChatId, parseMode: "HTML" });
    await sendTelegramPhoto(chartUrl, { chatId: destChatId, caption: chartCaption });
  }

  await VendorProfile.findByIdAndUpdate(vendorObjectId, { telegramReportLastSentAt: now }).catch(() => {});

  return { sent: true };
}
