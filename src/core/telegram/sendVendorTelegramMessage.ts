import Business from "@/models/Business";
import { sendTelegramMessage } from "@/lib/telegram";
import { VENDOR_TELEGRAM_MESSAGE_TYPES } from "./vendorMessageTypes";

/**
 * Routes an automated alert to a vendor's configured Telegram destination(s)
 * for that message type -- their team group, their personal DM, both, or
 * neither, per Business.telegramMessageRouting (admin-configurable at
 * console/admin/vendors/[id]/telegram). Falls back to each type's
 * defaultGroup/defaultPersonal when the business hasn't configured that
 * type yet, so an unconfigured vendor with only telegramChatId set keeps
 * getting alerts in their group exactly like before this routing existed.
 */
export async function sendVendorTelegramMessage(
  businessId: string,
  type: string,
  text: string
): Promise<{ group: boolean; personal: boolean }> {
  const business = await Business.findById(businessId)
    .select("telegramChatId telegramPersonalChatId telegramMessageRouting")
    .lean<any>();
  if (!business) return { group: false, personal: false };

  const def = VENDOR_TELEGRAM_MESSAGE_TYPES.find((t) => t.key === type);
  const routing = (business.telegramMessageRouting || {})[type];
  const sendToGroup = routing?.group ?? def?.defaultGroup ?? true;
  const sendToPersonal = routing?.personal ?? def?.defaultPersonal ?? false;

  let groupOk = false;
  let personalOk = false;

  if (sendToGroup && business.telegramChatId) {
    groupOk = await sendTelegramMessage(text, { chatId: business.telegramChatId });
  }
  if (sendToPersonal && business.telegramPersonalChatId) {
    personalOk = await sendTelegramMessage(text, { chatId: business.telegramPersonalChatId });
  }

  return { group: groupOk, personal: personalOk };
}
