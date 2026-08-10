import Business from "@/models/Business";
import TelegramMessageTemplate from "@/models/TelegramMessageTemplate";
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
 *
 * WORDING: if a super admin has configured a message template for this
 * type (models/TelegramMessageTemplate.ts, editable from Settings >
 * Integrations for a super admin -- see core/telegram/messageTokens.ts for
 * the {{token}} placeholders each type supports), that template is
 * rendered with `tokens` and used instead of the caller's own hardcoded
 * `text` -- applies identically to every vendor, per explicit direction
 * ("give me box to format or configuration message... same should be
 * applied to all vendors"). No template configured yet -- or a token the
 * caller didn't pass -- just falls back to `text` / an empty string,
 * never breaks the send.
 */
export async function sendVendorTelegramMessage(
  businessId: string,
  type: string,
  text: string,
  tokens?: Record<string, string>
): Promise<{ group: boolean; personal: boolean }> {
  const business = await Business.findById(businessId)
    .select("name telegramChatId telegramPersonalChatId telegramMessageRouting")
    .lean<any>();
  if (!business) return { group: false, personal: false };

  const template = await TelegramMessageTemplate.findOne({ key: type }).lean<any>();
  if (template?.template) {
    const merged: Record<string, string> = { businessName: business.name || "", date: new Date().toLocaleDateString("en-IN"), ...tokens };
    text = template.template.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) => merged[name] ?? "");
  }

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
