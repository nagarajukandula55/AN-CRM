import { sendVendorTelegramMessage } from "./sendVendorTelegramMessage";
import { sendVendorWhatsAppMessage } from "./sendVendorWhatsAppMessage";
import { getVendorPlanKey } from "@/core/pricing/planAccess";

/**
 * Fires an alert type down BOTH channels a vendor might have configured --
 * Telegram (Pro+ only -- see the plan-key check below, per explicit
 * direction "telegram messaging and all from pro only not for starter")
 * and WhatsApp (only sends once the business has its own WhatsApp
 * Business API Integration row set up, silent no-op otherwise; WhatsApp
 * itself is already Ultimate-only via its bundled comms quota, see
 * plans.ts's commsQuota). Best-effort on both: one channel failing/being
 * unconfigured never blocks or throws for the other, and neither ever
 * throws back to the caller -- same contract each individual sender
 * already has.
 */
export async function sendVendorAlert(
  vendorObjectId: string,
  type: string,
  text: string,
  tokens?: Record<string, string>,
  whatsappExtraRecipients?: string[]
): Promise<void> {
  // null (no active plan known -- e.g. an admin-provisioned vendor with no
  // self-serve subscription) stays permissively allowed, same fallback
  // every other plan-gate in this codebase uses; only an explicit STARTER
  // plan is blocked.
  const planKey = await getVendorPlanKey(vendorObjectId).catch(() => null);
  const telegramAllowed = planKey !== "STARTER";

  await Promise.allSettled([
    telegramAllowed ? sendVendorTelegramMessage(vendorObjectId, type, text, tokens) : Promise.resolve(),
    sendVendorWhatsAppMessage(vendorObjectId, type, text, tokens, whatsappExtraRecipients),
  ]);
}
