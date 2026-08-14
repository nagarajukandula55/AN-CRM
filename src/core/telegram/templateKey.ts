/**
 * A WhatsApp variant of an alert type is stored as its own
 * TelegramMessageTemplate row under a channel-namespaced key
 * ("NEW_WORKORDER__WHATSAPP") rather than adding a compound unique index
 * on the model -- keeps the pre-existing unique index on `key` alone
 * untouched (no migration against the production collection) while still
 * letting Telegram and WhatsApp wording diverge per alert type.
 */
export type MessageChannel = "TELEGRAM" | "WHATSAPP";

export function templateKeyFor(type: string, channel: MessageChannel): string {
  const base = type.trim().toUpperCase();
  return channel === "WHATSAPP" ? `${base}__WHATSAPP` : base;
}
