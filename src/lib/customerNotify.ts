/**
 * Customer-facing SMS/WhatsApp dispatcher — sends alerts and the NPS
 * feedback link to a CUSTOMER's own phone (job sheet `phone`), distinct
 * from lib/notify.ts's staff/admin alert channel (which sends to a fixed
 * list of internal recipients configured on the Integration itself).
 *
 * SMS is the only channel wired to an actual gateway so far, per explicit
 * direction ("first will use SMS but simultaneously we have to work for
 * WhatsApp on priority") -- WhatsApp customer messages need a Meta
 * WhatsApp Business Cloud API account plus pre-approved message templates
 * (Meta only allows free-form text to a customer within a 24h window of
 * THEM messaging first; every trigger here is business-initiated, so
 * outside that window a template is mandatory) neither of which exist yet.
 * sendCustomerWhatsApp() below is a ready-to-wire stub for once that
 * template/account setup is done -- same call sites, no further plumbing.
 *
 * Every function here is a no-op (not a throw) when nothing is configured
 * yet, so a business with no SMS gateway set up never blocks a workorder
 * status transition -- see the `if (!integration) return` guards.
 */
import { connectDB } from "@/lib/mongodb";
import Integration, { SmsConfig } from "@/models/Integration";

async function sendViaMsg91(credentials: Record<string, string>, senderId: string | undefined, to: string, message: string): Promise<void> {
  const authKey = credentials.authKey;
  const route = credentials.route || "4"; // MSG91's default transactional route
  if (!authKey) throw new Error("MSG91 authKey missing from Integration config");
  const params = new URLSearchParams({
    authkey: authKey,
    mobiles: to.replace(/\D/g, ""),
    message,
    sender: senderId || credentials.senderId || "",
    route,
  });
  const res = await fetch(`https://api.msg91.com/api/sendhttp.php?${params.toString()}`);
  const text = await res.text();
  if (!res.ok || text.toUpperCase().startsWith("ERROR")) {
    throw new Error(`MSG91 send failed for ${to}: ${text}`);
  }
}

async function sendViaTwilio(credentials: Record<string, string>, to: string, message: string): Promise<void> {
  const { accountSid, authToken, fromNumber } = credentials;
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio accountSid/authToken/fromNumber missing from Integration config");
  }
  const body = new URLSearchParams({ To: to, From: fromNumber, Body: message });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twilio send failed for ${to}: ${err}`);
  }
}

/**
 * Sends a plain-text SMS to a customer's phone via whichever gateway this
 * business has configured under Integration{provider: "SMS"}. Never
 * throws -- errors are logged, not surfaced to the caller, so a workorder
 * status transition always succeeds regardless of SMS delivery.
 */
export async function sendCustomerSms(businessId: string, to: string, message: string): Promise<void> {
  if (!to?.trim()) return;
  try {
    await connectDB();
    let cfg: SmsConfig | null = null;
    const integration = await Integration.findOne({ businessId, provider: "SMS", isActive: true }).lean<any>();
    if (integration) {
      cfg = integration.config as SmsConfig;
    } else if (process.env.CENTRAL_API_URL) {
      // No business-specific gateway configured -- fall back to
      // central-api's shared SMS integration (same generic
      // PlatformIntegration mechanism as Resend/AI/Telegram), so a
      // business doesn't need its own gateway account just to send
      // customer SMS at all.
      try {
        const res = await fetch(`${process.env.CENTRAL_API_URL}/api/v1/integrations/sms`, {
          headers: { "x-api-key": process.env.CENTRAL_API_KEY || "" },
          cache: "no-store",
        });
        if (res.ok) {
          const body = await res.json();
          if (body?.configured) cfg = body.config as SmsConfig;
        }
      } catch (err) {
        console.error("[customerNotify:sms] failed to load central-api shared SMS config", err);
      }
    }
    if (!cfg) return; // no gateway configured anywhere -- silent no-op, not an error
    if (cfg.gateway === "MSG91") await sendViaMsg91(cfg.credentials || {}, cfg.senderId, to, message);
    else if (cfg.gateway === "TWILIO") await sendViaTwilio(cfg.credentials || {}, to, message);
    else console.warn(`[customerNotify:sms] Unsupported gateway "${cfg.gateway}" configured for business ${businessId}`);
  } catch (err) {
    console.error("[customerNotify:sms]", err);
  }
}

/**
 * WhatsApp equivalent -- not yet reachable from any call site (no business
 * has a WhatsApp Business Cloud API account / approved templates yet).
 * Reuses the same Meta Cloud API shape as lib/notify.ts's staff sender,
 * but against Integration{provider: "WHATSAPP"}.config.recipients being
 * irrelevant here (this sends to the CUSTOMER's own phone, not a fixed
 * staff list) -- once templates are approved, swap `text` for a
 * `template` payload (name + language + component params) per Meta's API.
 */
export async function sendCustomerWhatsApp(businessId: string, to: string, message: string): Promise<void> {
  if (!to?.trim()) return;
  try {
    await connectDB();
    let cfg: { phoneNumberId?: string; accessToken?: string } | null = null;
    const integration = await Integration.findOne({ businessId, provider: "WHATSAPP", isActive: true }).lean<any>();
    if (integration) {
      cfg = integration.config;
    } else if (process.env.CENTRAL_API_URL) {
      try {
        const res = await fetch(`${process.env.CENTRAL_API_URL}/api/v1/integrations/whatsapp`, {
          headers: { "x-api-key": process.env.CENTRAL_API_KEY || "" },
          cache: "no-store",
        });
        if (res.ok) {
          const body = await res.json();
          if (body?.configured) cfg = body.config;
        }
      } catch (err) {
        console.error("[customerNotify:whatsapp] failed to load central-api shared WhatsApp config", err);
      }
    }
    if (!cfg?.phoneNumberId || !cfg?.accessToken) return;
    const res = await fetch(`https://graph.facebook.com/v18.0/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.accessToken}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: message } }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`WhatsApp send failed for ${to}: ${err}`);
    }
  } catch (err) {
    console.error("[customerNotify:whatsapp]", err);
  }
}

/** Sends on every configured customer channel (currently just SMS) --
 * called from each job-sheet status transition and the NPS follow-up
 * cron. Fire-and-forget: callers should not `await` this if it would
 * delay the HTTP response, though awaiting is harmless since neither
 * sender ever throws. */
export async function notifyCustomer(businessId: string, phone: string, message: string): Promise<void> {
  await Promise.allSettled([
    sendCustomerSms(businessId, phone, message),
    sendCustomerWhatsApp(businessId, phone, message),
  ]);
}

const STATUS_MESSAGES: Record<string, (jobSheetNumber: string) => string> = {
  CREATED: (no) => `Your device has been received for service. Workorder ${no}. We'll keep you updated on its status.`,
  REPAIR_STARTED: (no) => `Repair has started on your device (Workorder ${no}).`,
  REPAIR_IN_PROGRESS: (no) => `Your device (Workorder ${no}) is now being repaired.`,
  PART_PENDING: (no) => `Your repair (Workorder ${no}) is on hold while we source a required part. We'll notify you once it resumes.`,
  REPAIR_COMPLETED: (no) => `Good news! Your device (Workorder ${no}) repair is complete and ready for pickup/delivery.`,
  CLOSED: (no) => `Your device (Workorder ${no}) has been handed over. Thank you for choosing us!`,
  CANCELLED: (no) => `Your workorder ${no} has been cancelled.`,
};

/** Sends the standard customer-facing status-change alert for a job
 * sheet's new status, if one is defined for it. Called from every
 * transition route (create, start-repair, part-pending, resume-repair,
 * close, handover, cancel) right after the status is actually saved. */
export async function notifyJobSheetStatusChange(
  businessId: string,
  phone: string,
  jobSheetNumber: string,
  status: string
): Promise<void> {
  const build = STATUS_MESSAGES[status];
  if (!build) return;
  await notifyCustomer(businessId, phone, build(jobSheetNumber));
}
