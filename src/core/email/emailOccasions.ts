/**
 * Catalog of every transactional-email "occasion" the app sends, and which
 * {{token}} placeholders each one's template can use -- the email
 * counterpart to core/telegram/vendorMessageTypes.ts, same pattern:
 * super admin writes the subject/body once per occasion
 * (models/EmailTemplate.ts, /api/admin/email-templates), every future send
 * of that occasion uses it instead of the hardcoded fallback in
 * services/email/resend.service.ts. A missing/disabled row just means
 * that occasion keeps using its hardcoded fallback text (or, if the admin
 * explicitly disabled it, skips sending -- see renderEmailTemplate.ts).
 */
export interface EmailOccasion {
  key: string;
  label: string;
  description: string;
  tokens: string[];
}

export const EMAIL_OCCASIONS: EmailOccasion[] = [
  { key: "FORGOT_PASSWORD", label: "Forgot Password", description: "Password reset link email.", tokens: ["resetUrl"] },
  { key: "WELCOME_REGISTRATION", label: "Welcome / Registration", description: "Sent right after a new account registers.", tokens: ["name"] },
  { key: "ACCOUNT_CREDENTIALS", label: "Account Created (Admin-issued)", description: "An admin/vendor created a login for someone else with a temporary password.", tokens: ["name", "email", "tempPassword", "loginUrl"] },
  { key: "VERIFICATION_OTP", label: "Email Verification OTP", description: "Generic email-verification code (e.g. public appointment request form).", tokens: ["otp", "purpose"] },
  { key: "VENDOR_APPLICATION_RECEIVED", label: "Vendor Application Received", description: "Confirms a vendor application was submitted and is under review.", tokens: ["vendorName", "businessName"] },
  { key: "VENDOR_APPROVED", label: "Vendor Approved", description: "A vendor application was approved.", tokens: ["vendorName", "businessName", "loginUrl"] },
  { key: "VENDOR_REJECTED", label: "Vendor Rejected", description: "A vendor application was rejected.", tokens: ["vendorName", "businessName", "reason"] },
  { key: "AGREEMENT_OTP", label: "Agreement Signing OTP", description: "OTP to verify identity before e-signing an agreement.", tokens: ["partyName", "agreementTitle", "otp", "signingLink"] },
  { key: "NEWSLETTER_WELCOME", label: "Newsletter Welcome", description: "Sent after a newsletter subscription.", tokens: [] },
];

export const EMAIL_OCCASION_KEYS = EMAIL_OCCASIONS.map((o) => o.key);

export function tokensForEmailOccasion(key: string): string[] {
  return EMAIL_OCCASIONS.find((o) => o.key === key)?.tokens || [];
}
