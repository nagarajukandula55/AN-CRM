/**
 * Shared "boxed card" look for Telegram alerts -- emoji title, optional
 * subtitle, a padded label/value table (Telegram HTML has no real <table>,
 * so this emulates one with a monospace <pre> block, same trick
 * lib/telegramReport.ts already used for workorder breakdowns), and an
 * optional confirmation footer line. Not money-specific -- any alert type
 * (new workorder, low stock, subscription expiry, etc.) can use this same
 * shape instead of hand-rolling its own <pre> table.
 */
export interface CardRow {
  label: string;
  value: string;
}

export interface CardOptions {
  emoji?: string;
  title: string;
  subtitle?: string;
  tableTitle?: string;
  rows: CardRow[];
  footer?: string; // pass the emoji inline, e.g. "✅ Credited to ..."
}

export function renderTelegramCard(opts: CardOptions): string {
  const { emoji, title, subtitle, tableTitle, rows, footer } = opts;
  const lines: string[] = [`<b>${emoji ? `${emoji} ` : ""}${title}</b>`];

  if (subtitle) lines.push("", `<b>${subtitle}</b>`);

  if (rows.length > 0) {
    const labelWidth = Math.max(...rows.map((r) => r.label.length));
    lines.push("", ...(tableTitle ? [`<b>${tableTitle}</b>`] : []), "<pre>");
    for (const r of rows) {
      lines.push(`${r.label.padEnd(labelWidth)}  ${r.value}`);
    }
    lines.push("</pre>");
  }

  if (footer) lines.push("", footer);

  return lines.join("\n");
}

// Tone -> emoji for a template's configurable footer (TelegramMessageTemplate
// .footerTone) -- same success/warning/danger/info vocabulary as the design
// system's Badge tones, just rendered as an emoji since Telegram messages
// are plain text/HTML.
export const FOOTER_TONE_EMOJI: Record<string, string> = {
  SUCCESS: "✅",
  WARNING: "⚠️",
  DANGER: "❌",
  INFO: "ℹ️",
  NONE: "",
};

export interface CardStyleOptions {
  icon?: string;
  title?: string;
  layout?: string; // "CARD" wraps `body`; anything else (or unset) returns `body` unchanged
  footerTone?: string;
  footerText?: string;
}

/**
 * Wraps an already-rendered (tokens substituted) message body in the boxed
 * card look -- emoji title + the body as-is + an optional toned footer line.
 * Used by both lib/telegramReport.ts (reports) and
 * sendVendorTelegramMessage.ts (notifications) so admin-configured
 * icon/layout/footerTone/footerText (models/TelegramMessageTemplate.ts)
 * behave identically everywhere. A FLAT (or unset) layout is a no-op --
 * every template that predates this option keeps sending exactly as before.
 */
export function applyCardStyle(body: string, opts: CardStyleOptions): string {
  if (opts.layout !== "CARD") return body;
  const lines: string[] = [];
  if (opts.title) lines.push(`<b>${opts.icon ? `${opts.icon} ` : ""}${opts.title}</b>`, "");
  lines.push(body);
  if (opts.footerText) {
    const emoji = FOOTER_TONE_EMOJI[opts.footerTone || "NONE"] || "";
    lines.push("", `${emoji ? `${emoji} ` : ""}${opts.footerText}`);
  }
  return lines.join("\n");
}
