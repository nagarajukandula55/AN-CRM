import TelegramMessageTemplate from "@/models/TelegramMessageTemplate";
import TelegramLog from "@/models/TelegramLog";
import Business from "@/models/Business";
import { sendTelegramMessage } from "@/lib/telegram";
import { VENDOR_TELEGRAM_MESSAGE_TYPES } from "./vendorMessageTypes";
import { resolveVendorChatConfig } from "./resolveVendorChatConfig";
import { templateKeyFor } from "./templateKey";

/**
 * Routes an automated alert to a VENDOR's configured Telegram
 * destination(s) for that message type -- their own team group, their own
 * personal DM, both, or neither, per VendorProfile.telegramMessageRouting.
 * `vendorObjectId` is a VendorProfile._id, NOT a Business._id -- moved off
 * Business once the platform became single-business/multi-vendor (see
 * VendorProfile.ts's telegram* field comment for why: every vendor
 * sharing one Business meant Business-level chat fields let only ONE
 * vendor's chat be linked at a time, platform-wide).
 *
 * WORDING: if a super admin has configured a message template for this
 * type (models/TelegramMessageTemplate.ts, Settings > Platform >
 * Notification Templates -- see core/telegram/messageTokens.ts for the
 * {{token}} placeholders each type supports, including the universal
 * {{vendorName}}/{{vendorId}}/{{businessName}}/{{date}} available on
 * every type), that template is rendered with `tokens` merged in and used
 * instead of the caller's own hardcoded `text`. No template configured
 * yet just falls back to `text`, never breaks the send.
 */
export async function sendVendorTelegramMessage(
  vendorObjectId: string,
  type: string,
  text: string,
  tokens?: Record<string, string>
): Promise<{ group: boolean; personal: boolean }> {
  const vendor = await resolveVendorChatConfig(vendorObjectId);
  if (!vendor) return { group: false, personal: false };

  const business = vendor.businessId
    ? await Business.findById(vendor.businessId).select("name").lean<any>()
    : null;

  const template = await TelegramMessageTemplate.findOne({ key: templateKeyFor(type, "TELEGRAM") }).lean<any>();
  const universalTokens: Record<string, string> = {
    businessName: business?.name || "",
    vendorName: vendor.vendorName || "",
    vendorId: vendor.vendorId || "",
    date: new Date().toLocaleDateString("en-IN"),
  };

  // Super admin's platform-wide kill switch for this alert type -- distinct
  // from a vendor's own Group/Personal destination checkboxes below.
  if (template?.enabled === false) {
    await TelegramLog.create({
      businessId: vendor.businessId, businessName: business?.name, vendorObjectId, vendorId: vendor.vendorId, vendorName: vendor.vendorName,
      type, text, sentToGroup: false, sentToPersonal: false, success: false,
    }).catch(() => {});
    return { group: false, personal: false };
  }
  if (template?.template && template.template !== "(disabled)") {
    const merged = { ...universalTokens, ...tokens };
    text = template.template.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) => merged[name] ?? "");
  }

  const def = VENDOR_TELEGRAM_MESSAGE_TYPES.find((t) => t.key === type);
  const routing = vendor.telegramMessageRouting[type];
  const sendToGroup = routing?.group ?? def?.defaultGroup ?? true;
  const sendToPersonal = routing?.personal ?? def?.defaultPersonal ?? false;

  let groupOk = false;
  let personalOk = false;

  if (sendToGroup && vendor.telegramChatId) {
    groupOk = await sendTelegramMessage(text, { chatId: vendor.telegramChatId });
  }
  if (sendToPersonal && vendor.telegramPersonalChatId) {
    personalOk = await sendTelegramMessage(text, { chatId: vendor.telegramPersonalChatId });
  }

  if (sendToGroup || sendToPersonal) {
    await TelegramLog.create({
      businessId: vendor.businessId,
      businessName: business?.name,
      vendorObjectId,
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      type,
      text,
      sentToGroup: groupOk,
      sentToPersonal: personalOk,
      success: (sendToGroup ? groupOk : true) && (sendToPersonal ? personalOk : true),
    }).catch(() => {});
  }

  return { group: groupOk, personal: personalOk };
}
