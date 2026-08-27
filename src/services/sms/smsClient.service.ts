/**
 * smsClient.service.ts — SMS/OTP gateway client for phone-based login.
 *
 * Modeled on services/gst/gspClient.service.ts's own pattern: this is the
 * ONE place that talks to a real SMS provider, and it throws a clear,
 * actionable error the moment credentials are missing rather than
 * fabricating a success response. The moment real credentials are added
 * to env, phone-OTP login goes live with zero code changes upstream --
 * api/auth/otp/send/route.ts is already written against this interface.
 *
 * Targets MSG91 (the most common India SMS/OTP gateway, DLT-compliant) --
 * swap the fetch call below for a different provider (Twilio, Fast2SMS,
 * etc.) if that's what gets set up instead; the interface (sendOtp) stays
 * the same either way.
 *
 * India-specific requirement: sending OTP/transactional SMS legally
 * requires a DLT-registered sender header and template with the telecom
 * regulator (TRAI) -- this is a real business/compliance step, not
 * something any code change can skip. MSG91_TEMPLATE_ID below is that
 * DLT-approved template's id.
 */

export class SmsNotConfiguredError extends Error {
  constructor() {
    super(
      "SMS/OTP gateway not configured -- set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID (a DLT-registered OTP template) in env to enable phone login."
    );
    this.name = "SmsNotConfiguredError";
  }
}

/** Sends a 6-digit OTP to `phone` (plain 10-digit Indian mobile number, no country code) via MSG91's OTP API. */
export async function sendOtpSms(phone: string, otp: string): Promise<{ success: boolean; error?: string }> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !templateId) {
    throw new SmsNotConfiguredError();
  }

  try {
    const res = await fetch("https://control.msg91.com/api/v5/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: authKey },
      body: JSON.stringify({
        template_id: templateId,
        mobile: `91${phone}`,
        otp,
        otp_expiry: 10, // minutes
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.type === "error") {
      return { success: false, error: data?.message || `SMS gateway responded with ${res.status}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "SMS gateway request failed" };
  }
}
