import VendorProfile from "@/models/VendorProfile";
import Business from "@/models/Business";
import Integration, { WhatsAppConfig } from "@/models/Integration";
import TelegramMessageTemplate from "@/models/TelegramMessageTemplate";
import TelegramLog from "@/models/TelegramLog";
import { templateKeyFor } from "./templateKey";

/**
 * WhatsApp counterpart to sendVendorTelegramMessage.ts -- same event
 * catalog, same super-admin template system, same TelegramLog audit trail,
 * keyed by `vendorObjectId` (VendorProfile._id) the same way, so a
 * WhatsApp send is scoped to the same specific vendor as its Telegram
 * counterpart.
 *
 * Credentials still come from the BUSINESS's own Integration(provider:
 * 'WHATSAPP') row (Meta WhatsApp Business API access is provisioned per
 * business, not per vendor) -- a business with no WhatsApp Integration
 * configured yet just gets a silent no-op here, same "never breaks the
 * caller" contract as the Telegram path.
 *
 * extraRecipients lets a caller reach someone OUTSIDE the business's own
 * configured staff list for this one send -- e.g. the customer's own phone
 * number for a customer-facing repair-status update.
 */
export async function sendVendorWhatsAppMessage(
  vendorObjectId: string,
  type: string,
  text: string,
  tokens?: Record<string, string>,
  extraRecipients?: string[]
): Promise<{ sent: boolean; recipients: number }> {
  const vendor = await VendorProfile.findById(vendorObjectId).select("vendorId companyName businessId").lean<any>();
  if (!vendor) return { sent: false, recipients: 0 };

  const [business, integration] = await Promise.all([
    vendor.businessId ? Business.findById(vendor.businessId).select("name").lean<any>() : null,
    vendor.businessId ? Integration.findOne({ businessId: vendor.businessId, provider: "WHATSAPP", isActive: true }).lean<any>() : null,
  ]);

  const template = await TelegramMessageTemplate.findOne({ key: templateKeyFor(type, "WHATSAPP") }).lean<any>();
  const logBase = {
    businessId: vendor.businessId, businessName: business?.name,
    vendorObjectId, vendorId: vendor.vendorId, vendorName: vendor.companyName,
    type, channel: "WHATSAPP" as const,
  };
  if (template?.enabled === false) {
    await TelegramLog.create({ ...logBase, text, success: false }).catch(() => {});
    return { sent: false, recipients: 0 };
  }
  if (template?.template && template.template !== "(disabled)") {
    const merged: Record<string, string> = {
      businessName: business?.name || "", vendorName: vendor.companyName || "", vendorId: vendor.vendorId || "",
      date: new Date().toLocaleDateString("en-IN"), ...tokens,
    };
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

  await TelegramLog.create({ ...logBase, text, success: sentCount > 0 }).catch(() => {});

  return { sent: sentCount > 0, recipients: sentCount };
}
