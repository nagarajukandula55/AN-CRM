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
// Every device/job-sheet field a template can reference, on top of the
// universal set below -- populated at the two call sites that actually
// have this data (api/crm/jobsheets/route.ts on create,
// [id]/close/route.ts on close). Per explicit direction ("we are taking
// brand model IMEI etc bit nothing is available for tokens").
const JOBSHEET_TOKENS = [
  "product", "brand", "deviceModel", "imei", "issueDescription", "engineerName", "email", "address", "city", "state",
  // Who registered/took intake for this workorder (CrmJobSheet.ccoName)
  // and who collected payment at handover (paymentCollectedByName) --
  // per explicit direction ("tokens of workorder registered person name
  // and cash collected by name and engineer name").
  "registeredByName", "cashCollectedByName",
];

const REPORT_TOKENS = [
  "businessName", "vendorName", "vendorId", "date", "frequency",
  "revenue", "priorRevenue", "invoices", "priorInvoices",
  "activityLabel", "activity", "priorActivity", "changePct",
  "workorderBreakdown",
  "mtdRevenue", "mtdInvoices", "mtdActivity", "mtdWorkorderBreakdown",
];

export const MESSAGE_TOKENS: Record<string, string[]> = {
  NEW_WORKORDER: ["businessName", "vendorName", "vendorId", "workorderNumber", "customerName", "phone", "date", ...JOBSHEET_TOKENS],
  WORKORDER_CLOSED: ["businessName", "vendorName", "vendorId", "workorderNumber", "customerName", "phone", "invoiceNumber", "amount", "date", ...JOBSHEET_TOKENS],
  // New trigger -- a workorder used to CANCEL silently as far as Telegram
  // was concerned (only NEW_WORKORDER/WORKORDER_CLOSED existed). cancelReason
  // is always populated now that api/crm/jobsheets/[id]/cancel requires one.
  WORKORDER_CANCELLED: ["businessName", "vendorName", "vendorId", "workorderNumber", "customerName", "phone", "cancelReason", "date", ...JOBSHEET_TOKENS],
  PAYMENT_DUE: ["businessName", "vendorName", "vendorId", "invoiceNumber", "amount", "dueDate"],
  PAYMENT_RECEIVED: ["businessName", "vendorName", "vendorId", "invoiceNumber", "amount", "date"],
  SETTLEMENT: ["businessName", "vendorName", "vendorId", "amount", "date"],
  SUBSCRIPTION_EXPIRY: ["businessName", "vendorName", "vendorId", "planName", "expiryDate"],
  LOW_STOCK: ["businessName", "vendorName", "vendorId", "itemName", "currentStock", "reorderLevel"],
  CATALOG_REQUEST: ["businessName", "vendorName", "vendorId", "itemName", "status"],
  GENERAL_ANNOUNCEMENT: ["businessName", "vendorName", "vendorId", "date"],
  // The scheduled/on-demand report's own wording -- see
  // lib/telegramReport.ts's buildReportMessage, which checks for a saved
  // override under the frequency-specific key (DAILY_REPORT/WEEKLY_REPORT/
  // MONTHLY_REPORT, split from one shared BUSINESS_REPORT key so each
  // frequency is independently redesignable) before falling back to its
  // own hardcoded card layout. workorderBreakdown is a pre-formatted
  // <pre> block (SC only, empty string for non-SC / when nothing to show)
  // since a per-status table can't be reduced to one flat token.
  // mtd* tokens are only populated for DAILY_REPORT (empty string on the
  // other two) -- see buildReportMessage's own comment on why Weekly/
  // Monthly don't also get a month-to-date block.
  DAILY_REPORT: REPORT_TOKENS,
  WEEKLY_REPORT: REPORT_TOKENS,
  MONTHLY_REPORT: REPORT_TOKENS,
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
