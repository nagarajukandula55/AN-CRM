/**
 * Which {{token}} placeholders are available to a super admin writing the
 * message template for each Telegram alert type -- see
 * models/TelegramMessageTemplate.ts and
 * core/telegram/sendVendorTelegramMessage.ts's rendering step. Not every
 * type's caller passes every token it's DOCUMENTED as supporting yet (see
 * that file's own comment on which call sites are wired) -- an unfilled
 * token in a saved template just renders as an empty string, never breaks
 * the send.
 */
export const MESSAGE_TOKENS: Record<string, string[]> = {
  NEW_WORKORDER: ["businessName", "workorderNumber", "customerName", "phone", "date"],
  WORKORDER_CLOSED: ["businessName", "workorderNumber", "customerName", "invoiceNumber", "amount", "date"],
  PAYMENT_DUE: ["businessName", "invoiceNumber", "amount", "dueDate"],
  PAYMENT_RECEIVED: ["businessName", "invoiceNumber", "amount", "date"],
  SETTLEMENT: ["businessName", "amount", "date"],
  SUBSCRIPTION_EXPIRY: ["businessName", "planName", "expiryDate"],
  LOW_STOCK: ["businessName", "itemName", "currentStock", "reorderLevel"],
  CATALOG_REQUEST: ["businessName", "itemName", "status"],
  GENERAL_ANNOUNCEMENT: ["businessName", "date"],
};

const UNIVERSAL_TOKENS = ["businessName", "date"];

export function tokensFor(key: string): string[] {
  return MESSAGE_TOKENS[key] || UNIVERSAL_TOKENS;
}
