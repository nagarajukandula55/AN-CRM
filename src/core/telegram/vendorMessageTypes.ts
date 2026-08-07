/**
 * Catalog of the categories of automated Telegram alert a vendor business
 * can receive, and which of their two configured chats (group / personal
 * DM -- Business.telegramChatId / telegramPersonalChatId) each one routes
 * to by default. An admin can override the destination per business per
 * type from console/admin/vendors/[id]/telegram -- see
 * Business.telegramMessageRouting.
 */
export interface VendorTelegramMessageType {
  key: string;
  label: string;
  description: string;
  defaultGroup: boolean;
  defaultPersonal: boolean;
}

// Hardcoded list below is the FALLBACK -- central-api's AN CRM Admin
// panel (Telegram Triggers tab) is now the live source, so a new trigger
// type can be created there without an AN-CRM deploy. See
// getVendorTelegramMessageTypes() below, which merges the two: every
// central-api trigger, falling back to this list entirely if central-api
// is unreachable or has none configured yet.
export const VENDOR_TELEGRAM_MESSAGE_TYPES: VendorTelegramMessageType[] = [
  { key: "NEW_WORKORDER", label: "New Workorder", description: "A new job sheet / workorder was created for this vendor.", defaultGroup: true, defaultPersonal: false },
  { key: "WORKORDER_CLOSED", label: "Workorder Closed", description: "A workorder was closed and invoiced.", defaultGroup: true, defaultPersonal: false },
  { key: "PAYMENT_DUE", label: "Subscription Payment Due", description: "A subscription invoice is due or overdue.", defaultGroup: false, defaultPersonal: true },
  { key: "PAYMENT_RECEIVED", label: "Payment Received", description: "A subscription payment was confirmed.", defaultGroup: true, defaultPersonal: true },
  { key: "SETTLEMENT", label: "Settlement Processed", description: "A vendor payout/settlement was processed.", defaultGroup: false, defaultPersonal: true },
  { key: "SUBSCRIPTION_EXPIRY", label: "Subscription Expiring", description: "Trial or paid subscription is about to expire.", defaultGroup: false, defaultPersonal: true },
  { key: "LOW_STOCK", label: "Low Stock Alert", description: "A material/part has fallen below its reorder threshold.", defaultGroup: true, defaultPersonal: false },
  { key: "CATALOG_REQUEST", label: "Catalog Request Update", description: "A brand/model/solution catalog request was approved or rejected.", defaultGroup: true, defaultPersonal: false },
  { key: "GENERAL_ANNOUNCEMENT", label: "General Announcement", description: "One-off announcement or manual message sent by AN Group staff.", defaultGroup: true, defaultPersonal: false },
];

export const VENDOR_TELEGRAM_MESSAGE_TYPE_KEYS = VENDOR_TELEGRAM_MESSAGE_TYPES.map((t) => t.key);

/**
 * Live trigger catalog from central-api's AN CRM Admin panel, falling
 * back to the hardcoded VENDOR_TELEGRAM_MESSAGE_TYPES above whenever
 * central-api is unreachable or has nothing configured (keeps this
 * app fully functional through a central-api outage, same fallback
 * pattern every other central-api read in this codebase already uses).
 * Not cached beyond the request -- this is an admin-facing routing UI,
 * not a hot path, so a live read each time is fine.
 */
export async function getVendorTelegramMessageTypes(): Promise<VendorTelegramMessageType[]> {
  const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
  const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
  if (!CENTRAL_API_URL) return VENDOR_TELEGRAM_MESSAGE_TYPES;
  try {
    const res = await fetch(`${CENTRAL_API_URL}/api/v1/an-crm-admin/telegram-triggers`, {
      headers: { "x-api-key": CENTRAL_API_KEY || "" },
      cache: "no-store",
    });
    if (!res.ok) return VENDOR_TELEGRAM_MESSAGE_TYPES;
    const data = await res.json();
    const triggers = (data?.triggers || []).filter((t: any) => t.enabled !== false);
    if (triggers.length === 0) return VENDOR_TELEGRAM_MESSAGE_TYPES;
    return triggers.map((t: any) => ({
      key: t.key,
      label: t.label,
      description: t.description || "",
      defaultGroup: !!t.defaultGroup,
      defaultPersonal: !!t.defaultPersonal,
    }));
  } catch {
    return VENDOR_TELEGRAM_MESSAGE_TYPES;
  }
}
