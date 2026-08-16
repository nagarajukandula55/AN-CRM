import { sendVendorTelegramMessage } from "./sendVendorTelegramMessage";
import { sendVendorWhatsAppMessage } from "./sendVendorWhatsAppMessage";

/**
 * Fires an alert type down BOTH channels a vendor might have configured --
 * Telegram (always available, shared platform bot) and WhatsApp (only
 * sends once the business has its own WhatsApp Business API Integration
 * row set up, silent no-op otherwise). Best-effort on both: one channel
 * failing/being unconfigured never blocks or throws for the other, and
 * neither ever throws back to the caller -- same contract each individual
 * sender already has.
 */
export async function sendVendorAlert(
  vendorObjectId: string,
  type: string,
  text: string,
  tokens?: Record<string, string>,
  whatsappExtraRecipients?: string[]
): Promise<void> {
  await Promise.allSettled([
    sendVendorTelegramMessage(vendorObjectId, type, text, tokens),
    sendVendorWhatsAppMessage(vendorObjectId, type, text, tokens, whatsappExtraRecipients),
  ]);
}
