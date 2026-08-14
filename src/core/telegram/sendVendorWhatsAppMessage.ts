import Business from "@/models/Business";
import Integration, { WhatsAppConfig } from "@/models/Integration";
import TelegramMessageTemplate from "@/models/TelegramMessageTemplate";
import TelegramLog from "@/models/TelegramLog";
import { templateKeyFor } from "./templateKey";

/**
 * WhatsApp counterpart to sendVendorTelegramMessage.ts -- same event
 * catalog (core/telegram/vendorMessageTypes.ts), same super-admin template
 * system (models/TelegramMessageTemplate.ts, WhatsApp wording stored under
 * a "__WHATSAPP"-suffixed key so it can differ from the Telegram wording
 * for the same alert type), same TelegramLog audit trail.
 *
 * Credentials come from this business's own Integration(provider:
 * 'WHATSAPP') row (Meta WhatsApp Business API phoneNumberId + accessToken
 * + a recipients list) -- there is no shared platform WhatsApp bot the way
 * there is for Telegram, since WhatsApp Business API access is always
 * business-specific. A business with no WhatsApp Integration configured
 * (or not active) yet just gets a silent no-op here, same "never breaks
 * the caller" contract as the Telegram path -- the moment real credentials
 * are added, sends start working with zero code changes.
 *
 * extraRecipients lets a caller reach someone OUTSIDE the business's own
 * configured staff list for this one send -- e.g. the customer's own phone
 * number for a customer-facing repair-status update, distinct from the
 * business's internal WhatsApp recipients.
 */
export async function sendVendorWhatsAppMessage(
  businessId: string,
  type: string,
  text: string,
  tokens?: Record<string, string>,
  extraRecipients?: string[]
): Promise<{ sent: boolean; recipients: number }> {
  const [business, integration] = await Promise.all([
    Business.findById(businessId).select("name").lean<any>(),
    Integration.findOne({ businessId, provider: "WHATSAPP", isActive: true }).lean<any>(),
  ]);
  if (!business) return { sent: false, recipients: 0 };

  const template = await TelegramMessageTemplate.findOne({ key: templateKeyFor(type, "WHATSAPP") }).lean<any>();
  if (template?.enabled === false) {
    await TelegramLog.create({ businessId, businessName: business.name, type, channel: "WHATSAPP", text, success: false }).catch(() => {});
    return { sent: false, recipients: 0 };
  }
  if (template?.template && template.template !== "(disabled)") {
    const merged: Record<string, string> = { businessName: business.name || "", date: new Date().toLocaleDateString("en-IN"), ...tokens };
    text = template.template.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) => merged[name] ?? "");
  }

  const cfg = integration?.config as WhatsAppConfig | undefined;
  const recipients = [...(cfg?.recipients || []), ...(extraRecipients || [])].filter(Boolean);
  if (!cfg?.phoneNumberId || !cfg?.accessToken || recipients.length === 0) {
    return { sent: false, recipients: 0 };
  }

  const results = await Promise.allSettled(
    recipients.map((to) =>
      fetch(`https://graph.facebook.com/v18.0/${cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.accessToken}` },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
      }).then((res) => res.ok)
    )
  );
  const sentCount = results.filter((r) => r.status === "fulfilled" && r.value).length;

  await TelegramLog.create({
    businessId,
    businessName: business.name,
    type,
    channel: "WHATSAPP",
    text,
    success: sentCount > 0,
  }).catch(() => {});

  return { sent: sentCount > 0, recipients: sentCount };
}
