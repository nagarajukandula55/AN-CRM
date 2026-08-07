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
