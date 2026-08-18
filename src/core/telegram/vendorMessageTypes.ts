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
  // Splits the admin template editor into a "Report Templates" section
  // (this app's own scheduled/on-demand reports, boxed-card layout by
  // default) vs "Notification Templates" (everything else, one-off event
  // alerts) -- per explicit direction that reports should look and be
  // edited distinctly from notifications, not share one flat list.
  isReport?: boolean;
}

// The three report keys below are intrinsic to THIS app (its own scheduled
// business report, see lib/telegramReport.ts) -- central-api's Telegram
// Triggers tab has no concept of them and never will, so
// getVendorTelegramMessageTypes() always keeps these regardless of what
// central-api returns, instead of letting a live trigger fetch silently
// replace the whole catalog and make "Report Templates" disappear from the
// admin UI (the bug this comment is fixing -- a super admin with
// CENTRAL_API_URL configured saw only Notification Templates, never
// Reports, because the central-api trigger list doesn't include them).
const REPORT_MESSAGE_TYPES: VendorTelegramMessageType[] = [
  // Split from one shared BUSINESS_REPORT key into three -- each frequency
  // is now redesignable independently (own icon/layout/footer, own wording)
  // instead of sharing one template gated only by a {{frequency}} token.
  { key: "DAILY_REPORT", label: "Daily Business Report", description: "The scheduled/on-demand Daily revenue + workorder report (/report, /sendreports, /link's first report).", defaultGroup: true, defaultPersonal: true, isReport: true },
  { key: "WEEKLY_REPORT", label: "Weekly Business Report", description: "The scheduled/on-demand Weekly revenue + workorder report.", defaultGroup: true, defaultPersonal: true, isReport: true },
  { key: "MONTHLY_REPORT", label: "Monthly Business Report", description: "The scheduled/on-demand Monthly revenue + workorder report.", defaultGroup: true, defaultPersonal: true, isReport: true },
];

// Hardcoded list below is the actual SOURCE OF TRUTH for notification types
// right now -- central-api's Telegram Triggers tab exists and its live-fetch
// code path is still here (see USE_CENTRAL_API_TRIGGERS below), but is
// switched off until central-api integration is revisited; every trigger
// type, and all its wording/icon/layout, is edited from THIS app's own
// Settings > Platform > Notification/Report Templates in the meantime. A
// new trigger type is added here, in code, not from central-api, until
// that flag flips back.
export const VENDOR_TELEGRAM_MESSAGE_TYPES: VendorTelegramMessageType[] = [
  { key: "NEW_WORKORDER", label: "New Workorder", description: "A new job sheet / workorder was created for this vendor.", defaultGroup: true, defaultPersonal: false },
  { key: "WORKORDER_CLOSED", label: "Workorder Closed", description: "A workorder was closed and invoiced.", defaultGroup: true, defaultPersonal: false },
  { key: "WORKORDER_CANCELLED", label: "Workorder Cancelled", description: "A workorder was cancelled, with the staff-entered reason.", defaultGroup: true, defaultPersonal: false },
  { key: "PAYMENT_DUE", label: "Subscription Payment Due", description: "A subscription invoice is due or overdue.", defaultGroup: false, defaultPersonal: true },
  { key: "PAYMENT_RECEIVED", label: "Payment Received", description: "A subscription payment was confirmed.", defaultGroup: true, defaultPersonal: true },
  { key: "SETTLEMENT", label: "Settlement Processed", description: "A vendor payout/settlement was processed.", defaultGroup: false, defaultPersonal: true },
  { key: "SUBSCRIPTION_EXPIRY", label: "Subscription Expiring", description: "Trial or paid subscription is about to expire.", defaultGroup: false, defaultPersonal: true },
  { key: "LOW_STOCK", label: "Low Stock Alert", description: "A material/part has fallen below its reorder threshold.", defaultGroup: true, defaultPersonal: false },
  { key: "CATALOG_REQUEST", label: "Catalog Request Update", description: "A brand/model/solution catalog request was approved or rejected.", defaultGroup: true, defaultPersonal: false },
  { key: "GENERAL_ANNOUNCEMENT", label: "General Announcement", description: "One-off announcement or manual message sent by AN Group staff.", defaultGroup: true, defaultPersonal: false },
  ...REPORT_MESSAGE_TYPES,
];

export const VENDOR_TELEGRAM_MESSAGE_TYPE_KEYS = VENDOR_TELEGRAM_MESSAGE_TYPES.map((t) => t.key);

// Per explicit direction: pull Telegram trigger/formatting configuration
// back onto THIS app entirely while everything is still being stabilized
// (icons, layout, report split, tokens, etc. -- all the recent passes),
// rather than half-live in central-api's Telegram Triggers tab where a
// super admin here can't see or fix it. central-api integration comes back
// later -- flip this back to true then; the live-fetch code path below is
// untouched and ready, just not called while this is false.
const USE_CENTRAL_API_TRIGGERS = false;

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
  if (!USE_CENTRAL_API_TRIGGERS) return VENDOR_TELEGRAM_MESSAGE_TYPES;
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
    const notificationTypes: VendorTelegramMessageType[] = triggers.map((t: any) => ({
      key: t.key,
      label: t.label,
      description: t.description || "",
      defaultGroup: !!t.defaultGroup,
      defaultPersonal: !!t.defaultPersonal,
    }));
    // Always append the app's own report types -- central-api's trigger
    // list has no concept of them, so a live fetch must never crowd them
    // out (see REPORT_MESSAGE_TYPES's own comment on the bug this fixes).
    return [...notificationTypes, ...REPORT_MESSAGE_TYPES];
  } catch {
    return VENDOR_TELEGRAM_MESSAGE_TYPES;
  }
}
