/**
 * Notification dispatcher — sends Telegram & WhatsApp alerts for ERP events.
 * All configuration (tokens, chat IDs, recipients) is read from DB at call time.
 * No keys are hardcoded here; everything comes from the Integrations admin UI.
 */

import { connectDB } from '@/lib/mongodb';
import Integration, { TelegramConfig, WhatsAppConfig } from '@/models/Integration';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type NotifyEvent =
  | 'NEW_ORDER'
  | 'ORDER_STATUS_CHANGE'
  | 'NEW_INVOICE'
  | 'INVOICE_OVERDUE'
  | 'PAYMENT_RECEIVED'
  | 'NEW_PRODUCT'
  | 'STOCK_CHANGE'
  | 'LOW_STOCK'
  | 'NEW_AGREEMENT'
  | 'AGREEMENT_SIGNED'
  | 'STAFF_ALERT'
  // CRM lifecycle events (call entry -> job sheet -> invoice -> closure) —
  // see app/api/crm/calls/route.ts and app/api/crm/jobsheets/[id]/close/route.ts.
  | 'NEW_CRM_CALL'
  | 'CRM_JOB_CLOSED';

export interface NotifyOptions {
  event: NotifyEvent;
  /** Plain text / HTML message */
  message: string;
  /** Optional: restrict lookup to a specific business */
  businessId?: string;
}

// ---------------------------------------------------------------------------
// Telegram sender
// ---------------------------------------------------------------------------
async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Telegram ${chatId}: ${JSON.stringify(err)}`);
  }
}

// ---------------------------------------------------------------------------
// WhatsApp Business API sender (v18.0)
// ---------------------------------------------------------------------------
async function sendWhatsApp(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp ${to}: ${JSON.stringify(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher — never throws; errors are caught per-channel
// ---------------------------------------------------------------------------
export async function notify(opts: NotifyOptions): Promise<void> {
  const { event, message, businessId } = opts;

  try {
    await connectDB();

    const query: Record<string, unknown> = { isActive: true };
    if (businessId) query.businessId = businessId;

    const integrations = await Integration.find(query).lean();

    const dispatches: Promise<void>[] = [];

    for (const integration of integrations) {
      // ---- Telegram ----
      if (integration.provider === 'TELEGRAM') {
        const cfg = integration.config as TelegramConfig;
        const triggers = cfg.notificationTriggers || [];
        // Empty triggers list = receive ALL events
        if (triggers.length > 0 && !triggers.includes(event)) continue;

        const botToken = cfg.botToken;
        const chatIds = cfg.chatIds || [];
        if (!botToken || chatIds.length === 0) continue;

        const formatted = `<b>🔔 ${event.replace(/_/g, ' ')}</b>\n\n${message}`;
        for (const chatId of chatIds) {
          dispatches.push(
            sendTelegram(botToken, chatId, formatted).catch((err) =>
              console.error('[notify:telegram]', err)
            )
          );
        }
      }

      // ---- WhatsApp ----
      if (integration.provider === 'WHATSAPP') {
        const cfg = integration.config as WhatsAppConfig;
        const triggers = cfg.notificationTriggers || [];
        if (triggers.length > 0 && !triggers.includes(event)) continue;

        const phoneNumberId = cfg.phoneNumberId;
        const accessToken = cfg.accessToken;
        const recipients = cfg.recipients || [];
        if (!phoneNumberId || !accessToken || recipients.length === 0) continue;

        const formatted = `🔔 ${event.replace(/_/g, ' ')}\n\n${message}`;
        for (const recipient of recipients) {
          dispatches.push(
            sendWhatsApp(phoneNumberId, accessToken, recipient, formatted).catch((err) =>
              console.error('[notify:whatsapp]', err)
            )
          );
        }
      }
    }

    await Promise.allSettled(dispatches);
  } catch (err) {
    // Never crash the caller
    console.error('[notify] dispatch error:', err);
  }
}
