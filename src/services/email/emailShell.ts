/**
 * Shared branded wrapper every transactional email renders through, so a
 * password reset, an OTP, a vendor approval, and an invoice notice all read
 * as the same product instead of 12 independently hand-rolled `<p>` blocks
 * (which is what this file replaces -- see git history / resend.service.ts's
 * old inline fallbacks). Table-based layout with inlined styles throughout
 * -- required for real-world email client support (Outlook/Gmail strip
 * <style> blocks and flex/grid), not a stylistic choice.
 *
 * Colors/type echo this app's own design tokens (globals.css) translated to
 * email-safe equivalents: no CSS custom properties (unsupported in email),
 * no Google Fonts (most clients block external font loads), so the accent
 * copper and the serif display pairing are hardcoded hex/font-stack here
 * rather than read from the token system.
 */

const ACCENT = "#2563EB";
const ACCENT_SOFT = "#F6EBE3";
const INK = "#16181C";
const INK_2 = "#52565C";
const INK_3 = "#8B8F94";
const BORDER = "rgba(30,27,20,0.10)";
const BG = "#F4F2ED";
const SURFACE = "#FFFFFF";
const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Iowan Old Style','Palatino Linotype',Palatino,serif";

export function renderEmailShell({
  heading,
  bodyHtml,
  previewText,
}: {
  heading: string;
  bodyHtml: string;
  previewText?: string;
}): string {
  return `<!doctype html>
<html>
<head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${BG};font-family:${SANS};">
${previewText ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${SURFACE};border-radius:16px;border:1px solid ${BORDER};overflow:hidden;">
      <tr><td style="padding:26px 32px;border-bottom:1px solid ${BORDER};">
        <span style="font-family:${SERIF};font-style:italic;font-size:20px;color:${INK};">AN <span style="color:${ACCENT};">Group</span></span>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:19px;line-height:1.4;font-weight:600;color:${INK};font-family:${SANS};">${heading}</h1>
        <div style="font-size:14px;line-height:1.65;color:${INK_2};font-family:${SANS};">${bodyHtml}</div>
      </td></tr>
      <tr><td style="padding:18px 32px;background:${BG};border-top:1px solid ${BORDER};">
        <p style="margin:0;font-size:12px;color:${INK_3};font-family:${SANS};">This is an automated message from AN Group. If you weren't expecting this email, you can safely ignore it.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Primary CTA button -- the one clickable action an email centers on. */
export function emailButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;padding:12px 26px;background:${ACCENT};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;font-family:${SANS};">${label}</a>`;
}

/** Large centered code display, for OTPs/verification codes. */
export function emailCode(code: string): string {
  return `<div style="text-align:center;margin:22px 0;"><span style="display:inline-block;font-family:'Courier New',monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:${INK};background:${BG};padding:14px 26px;border-radius:10px;">${code}</span></div>`;
}

/** Muted key/value info block (credentials, reference numbers). */
export function emailInfoBox(rows: { label: string; value: string }[]): string {
  const rowsHtml = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 0;font-size:13px;color:${INK_3};font-family:${SANS};">${r.label}</td><td style="padding:6px 0;font-size:13px;color:${INK};font-weight:600;font-family:${SANS};text-align:right;">${r.value}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ACCENT_SOFT};border-radius:10px;padding:14px 18px;margin:18px 0;">${rowsHtml}</table>`;
}
