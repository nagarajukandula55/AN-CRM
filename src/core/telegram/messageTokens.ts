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
  NEW_WORKORDER: ["businessName", "vendorName", "vendorId", "workorderNumber", "customerName", "phone", "date"],
  WORKORDER_CLOSED: ["businessName", "vendorName", "vendorId", "workorderNumber", "customerName", "invoiceNumber", "amount", "date"],
  PAYMENT_DUE: ["businessName", "vendorName", "vendorId", "invoiceNumber", "amount", "dueDate"],
  PAYMENT_RECEIVED: ["businessName", "vendorName", "vendorId", "invoiceNumber", "amount", "date"],
  SETTLEMENT: ["businessName", "vendorName", "vendorId", "amount", "date"],
  SUBSCRIPTION_EXPIRY: ["businessName", "vendorName", "vendorId", "planName", "expiryDate"],
  LOW_STOCK: ["businessName", "vendorName", "vendorId", "itemName", "currentStock", "reorderLevel"],
  CATALOG_REQUEST: ["businessName", "vendorName", "vendorId", "itemName", "status"],
  GENERAL_ANNOUNCEMENT: ["businessName", "vendorName", "vendorId", "date"],
};

// Available on EVERY template regardless of type -- merged in automatically
// by sendVendorTelegramMessage/sendVendorWhatsAppMessage's rendering step,
// no per-call-site wiring needed. vendorName/vendorId were missing
// entirely before (per explicit direction, "vendor name is not available
// in tokens vendor id not there") -- every alert now knows which vendor
// it's actually for, not just which business.
const UNIVERSAL_TOKENS = ["businessName", "vendorName", "vendorId", "date"];

export function tokensFor(key: string): string[] {
  return MESSAGE_TOKENS[key] || UNIVERSAL_TOKENS;
}
