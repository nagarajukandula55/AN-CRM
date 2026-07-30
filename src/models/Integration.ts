import mongoose, { Schema, Document, Model } from 'mongoose';

export type CourierProviderKey =
  | 'SHIPROCKET'
  | 'DELHIVERY'
  | 'BLUEDART'
  | 'XPRESSBEES'
  | 'ECOM_EXPRESS';

export type AiProviderKey =
  | 'GROQ'
  | 'CEREBRAS'
  | 'MISTRAL'
  | 'CLOUDFLARE'
  | 'OPENROUTER'
  | 'GEMINI'
  | 'HUGGINGFACE'
  | 'OLLAMA';

export const AI_PROVIDER_KEYS: AiProviderKey[] = [
  'GROQ',
  'CEREBRAS',
  'MISTRAL',
  'CLOUDFLARE',
  'OPENROUTER',
  'GEMINI',
  'HUGGINGFACE',
  'OLLAMA',
];

export type IntegrationProvider =
  | 'TELEGRAM'
  | 'WHATSAPP'
  | 'SLACK'
  | 'EMAIL'
  | 'SMS'
  | 'ZENFORGE'
  | CourierProviderKey
  | AiProviderKey;

/** SMS gateways vary in request shape (MSG91: authkey + flow/route API,
 * Twilio: Account SID + Auth Token + REST API, others similar but
 * different field names) -- stored as a free-form credentials bag per
 * gateway, same pattern as CourierConfig/AiProviderConfig below, rather
 * than hardcoding one gateway's schema. See lib/customerNotify.ts for the
 * interpretation of these keys per gateway. */
export type SmsGatewayKey = 'MSG91' | 'TWILIO' | 'OTHER';
export interface SmsConfig {
  gateway: SmsGatewayKey;
  credentials: Record<string, string>;
  /** DLT-registered sender ID, required for commercial SMS in India
   * (mandatory for MSG91 and most Indian gateways) -- kept top-level
   * since every gateway needs it, unlike the rest of `credentials`. */
  senderId?: string;
}

export const COURIER_PROVIDER_KEYS: CourierProviderKey[] = [
  'SHIPROCKET',
  'DELHIVERY',
  'BLUEDART',
  'XPRESSBEES',
  'ECOM_EXPRESS',
];

export interface TelegramConfig {
  botToken: string;
  chatIds: string[];
  notificationTriggers: string[];
}

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
  recipients: string[];
  notificationTriggers: string[];
}

export interface SlackConfig {
  webhookUrl: string;
  channel: string;
  notificationTriggers: string[];
}

export type EmailProviderKind = 'SMTP' | 'SENDGRID' | 'MAILGUN' | 'SES' | 'RESEND';

export interface EmailConfig {
  /** Which of the below sub-configs is active for this business. Named to
   * match the admin/integrations page's EmailConfig.provider field (the
   * whole object is saved as-is into this Mixed config), not a separate
   * name — avoids a UI/model naming mismatch. Defaults to 'SMTP' for older
   * saved configs that predate this field. */
  provider?: EmailProviderKind;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  fromName: string;
  recipients: string[];
  notificationTriggers: string[];
  /** Resend-specific — used when emailProvider === 'RESEND'. Falls back to
   * process.env.RESEND_API_KEY / RESEND_FROM (the previous global-only
   * behavior) when a business hasn't configured its own key yet. */
  resendApiKey?: string;
  resendFromEmail?: string;
}

/**
 * Generic per-provider courier credential bag. Every courier aggregator/carrier
 * has a different auth shape (Shiprocket: email+password login exchanged for a
 * token; Delhivery/Bluedart/etc: typically a static API key or client
 * id/secret). Rather than hardcoding a Shiprocket-shaped schema, credentials
 * are stored as a free-form string map so any provider's fields can be added
 * without another schema migration. See src/services/shipping for the
 * interpretation of these keys per provider.
 */
export interface CourierConfig {
  credentials: Record<string, string>;
  /** Optional pickup location/warehouse identifier the provider needs at
   * shipment-creation time (e.g. Shiprocket's "pickup_location" nickname). */
  pickupLocation?: string;
}

/**
 * Content generation + multi-platform posting all live in the separate
 * Zenforge project (github.com/nagarajukandula55/zenforge), not in
 * ANgroup -- this is only the connection ANgroup uses to monitor and
 * control that external service (see src/app/api/admin/zenforge/*, which
 * proxies to Zenforge's own API using this baseUrl + apiSecret). ANgroup
 * never stores per-platform (YouTube/Facebook/etc.) credentials itself.
 */
export interface ZenforgeConfig {
  baseUrl: string;
  apiSecret: string;
}

/**
 * Generic per-provider AI credential bag — this is the single place across
 * all of nagarajukandula55's repos/apps (AN Dev Studio included) where AI
 * provider API keys/base URLs live. Each app fetches this list (masked over
 * HTTP, real values only server-side via the internal hub endpoint below)
 * instead of asking the user to paste keys into every app separately.
 * Free-form credentials bag for the same reason CourierConfig is: every
 * provider's auth shape differs (bearer API key vs base URL + optional key
 * for a local Ollama/LLM server).
 */
export interface AiProviderConfig {
  credentials: Record<string, string>;
  /** Priority in the fallback chain when multiple AI providers are active;
   * lower runs first. Mirrors AN Dev Studio's own ProviderManager order. */
  priority?: number;
  /** Optional default model id to request from this provider. */
  defaultModel?: string;
  /** Base URL override — used by OLLAMA (local) and OpenRouter-compatible
   * self-hosted endpoints. */
  baseUrl?: string;
}

export type IntegrationConfig =
  | TelegramConfig
  | WhatsAppConfig
  | SlackConfig
  | EmailConfig
  | SmsConfig
  | CourierConfig
  | ZenforgeConfig
  | AiProviderConfig;

export interface IIntegration extends Document {
  businessId: mongoose.Types.ObjectId;
  provider: IntegrationProvider;
  isActive: boolean;
  config: IntegrationConfig;
  createdAt: Date;
  updatedAt: Date;
}

const IntegrationSchema = new Schema<IIntegration>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    provider: {
      type: String,
      enum: ['TELEGRAM', 'WHATSAPP', 'SLACK', 'EMAIL', 'SMS', 'ZENFORGE', ...COURIER_PROVIDER_KEYS, ...AI_PROVIDER_KEYS],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    config: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

IntegrationSchema.index({ businessId: 1, provider: 1 }, { unique: true });

const Integration: Model<IIntegration> =
  mongoose.models.Integration ||
  mongoose.model<IIntegration>('Integration', IntegrationSchema);

export default Integration;
