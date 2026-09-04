import { sendVendorTelegramMessage } from "./sendVendorTelegramMessage";
import { sendVendorWhatsAppMessage } from "./sendVendorWhatsAppMessage";
import { getVendorTelegramTier } from "@/core/pricing/planAccess";

// A real, PAID Starter customer's "very basic" Telegram allowance --
// per explicit direction ("can have very basic functionality of telegram
// notifications for basic users too we should not abandon them"): just
// the two core "a workorder happened" pings, not the fuller operational
// set (cancellations, payments due/received, settlements, low stock,
// catalog requests, announcements) or automated business reports (see
// vendorHasTelegramReportsPlan in planAccess.ts).
const BASIC_TELEGRAM_ALERT_TYPES = new Set(["NEW_WORKORDER", "WORKORDER_CLOSED"]);

/**
 * Fires an alert type down BOTH channels a vendor might have configured --
 * Telegram (full set for Pro+ and for anyone still on trial regardless of
 * plan; a real paid Starter customer gets just BASIC_TELEGRAM_ALERT_TYPES
 * above, never zero) and WhatsApp (only sends once the business has its
 * own WhatsApp Business API Integration row set up, silent no-op
 * otherwise; WhatsApp itself is already Ultimate-only via its bundled
 * comms quota, see plans.ts's commsQuota). Best-effort on both: one
 * channel failing/being unconfigured never blocks or throws for the
 * other, and neither ever throws back to the caller -- same contract each
 * individual sender already has.
 */
export async function sendVendorAlert(
  vendorObjectId: string,
  type: string,
  text: string,
  tokens?: Record<string, string>,
  whatsappExtraRecipients?: string[]
): Promise<void> {
  // "NONE" (no active plan at all) still stays permissively allowed here,
  // same fallback every other plan-gate in this codebase uses -- an
  // admin-provisioned vendor with no self-serve subscription record
  // shouldn't silently lose alerts just because that record doesn't exist.
  const tier = await getVendorTelegramTier(vendorObjectId).catch(() => "FULL" as const);
  const telegramAllowed = tier !== "BASIC" || BASIC_TELEGRAM_ALERT_TYPES.has(type);

  await Promise.allSettled([
    telegramAllowed ? sendVendorTelegramMessage(vendorObjectId, type, text, tokens) : Promise.resolve(),
    sendVendorWhatsAppMessage(vendorObjectId, type, text, tokens, whatsappExtraRecipients),
  ]);
}
