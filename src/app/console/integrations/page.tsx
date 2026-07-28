'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import Link from 'next/link';

type Tab = 'messaging' | 'zenforge' | 'email' | 'ai';

/* ── AI providers (centralized hub — see src/models/Integration.ts,
   src/core/ai/orchestrator.ts, and /api/ai/hub/complete). Credentials added
   here are the single source AN Dev Studio and other apps fetch from,
   instead of asking for API keys separately in each app. ──────────────── */
interface AiProviderField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}

interface AiProviderMeta {
  key: string;
  label: string;
  icon: string;
  hint: string;
  fields: AiProviderField[];
}

const AI_PROVIDERS: AiProviderMeta[] = [
  {
    key: 'GROQ', label: 'Groq', icon: '⚡',
    hint: 'Free tier, very fast. Get a key at console.groq.com/keys.',
    fields: [{ key: 'apiKey', label: 'API key', placeholder: 'gsk_...', secret: true }, { key: 'model', label: 'Model (optional)', placeholder: 'llama-3.1-8b-instant' }],
  },
  {
    key: 'CEREBRAS', label: 'Cerebras', icon: '🧠',
    hint: 'Free tier. Get a key at cloud.cerebras.ai.',
    fields: [{ key: 'apiKey', label: 'API key', placeholder: 'csk-...', secret: true }, { key: 'model', label: 'Model (optional)', placeholder: 'llama3.1-8b' }],
  },
  {
    key: 'MISTRAL', label: 'Mistral', icon: '🌬️',
    hint: 'Free tier. Get a key at console.mistral.ai.',
    fields: [{ key: 'apiKey', label: 'API key', placeholder: '...', secret: true }, { key: 'model', label: 'Model (optional)', placeholder: 'mistral-small-latest' }],
  },
  {
    key: 'CLOUDFLARE', label: 'Cloudflare Workers AI', icon: '☁️',
    hint: 'Free tier. Needs both an account ID and an API token.',
    fields: [
      { key: 'accountId', label: 'Account ID', placeholder: '...' },
      { key: 'apiKey', label: 'API token', placeholder: '...', secret: true },
      { key: 'model', label: 'Model (optional)', placeholder: '@cf/meta/llama-3.1-8b-instruct' },
    ],
  },
  {
    key: 'OPENROUTER', label: 'OpenRouter', icon: '🔀',
    hint: 'Free-tier models available. Get a key at openrouter.ai/keys.',
    fields: [{ key: 'apiKey', label: 'API key', placeholder: 'sk-or-...', secret: true }, { key: 'model', label: 'Model (optional)', placeholder: 'meta-llama/llama-3.1-8b-instruct:free' }],
  },
  {
    key: 'GEMINI', label: 'Google Gemini', icon: '✨',
    hint: 'Free tier. Get a key at aistudio.google.com/apikey.',
    fields: [{ key: 'apiKey', label: 'API key', placeholder: 'AIza...', secret: true }, { key: 'model', label: 'Model (optional)', placeholder: 'gemini-1.5-flash' }],
  },
  {
    key: 'HUGGINGFACE', label: 'HuggingFace', icon: '🤗',
    hint: 'Free tier via Inference API. Get a token at huggingface.co/settings/tokens.',
    fields: [{ key: 'apiKey', label: 'Access token', placeholder: 'hf_...', secret: true }, { key: 'model', label: 'Model (optional)', placeholder: 'meta-llama/Llama-3.1-8B-Instruct' }],
  },
  {
    key: 'OLLAMA', label: 'Local LLM (Ollama)', icon: '🖥️',
    hint: 'Fully local — no cloud, no key. Point this at a reachable Ollama server.',
    fields: [{ key: 'baseUrl', label: 'Base URL', placeholder: 'http://localhost:11434' }, { key: 'model', label: 'Model (optional)', placeholder: 'llama3.1' }],
  },
];

/* ── Zenforge connection type ─────────────────────────────────────── */
// Posting/content-generation itself moved entirely to the Zenforge project
// (github.com/nagarajukandula55/zenforge) -- ANgroup no longer stores
// per-platform social credentials or publishes anything itself. This is
// just the connection config (base URL + shared secret) used to monitor
// and control that external service from /console/zenforge.
interface ZenforgeConfig {
  baseUrl: string;
  apiSecret: string;
}

interface EmailConfig {
  provider: 'SMTP' | 'SENDGRID' | 'MAILGUN' | 'SES' | 'RESEND';
  enabled: boolean;
  fromName: string;
  fromEmail: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  apiKey?: string;       // Sendgrid / Mailgun / SES key
  mailgunDomain?: string;
  sesRegion?: string;
  // Resend — separate from `apiKey` above so a business that later
  // switches providers doesn't silently reuse the wrong key.
  resendApiKey?: string;
  resendFromEmail?: string;
  configured: boolean;
}

interface TelegramConfig {
  botToken: string;
  chatIds: string[];
  notificationTriggers: string[];
}

interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
  recipients: string[];
  notificationTriggers: string[];
}

interface IntegrationData {
  isActive: boolean;
  config: Record<string, unknown>;
}

interface BusinessOption {
  _id: string;
  name: string;
  brandName?: string;
}

const NOTIFICATION_EVENTS = [
  { key: 'NEW_ORDER', label: 'New Order' },
  { key: 'ORDER_STATUS_CHANGE', label: 'Order Status Change' },
  { key: 'NEW_INVOICE', label: 'New Invoice' },
  { key: 'INVOICE_OVERDUE', label: 'Invoice Overdue' },
  { key: 'PAYMENT_RECEIVED', label: 'Payment Received' },
  { key: 'NEW_PRODUCT', label: 'Product Uploaded' },
  { key: 'STOCK_CHANGE', label: 'Stock Change' },
  { key: 'LOW_STOCK', label: 'Low Stock Alert' },
  { key: 'NEW_AGREEMENT', label: 'New Agreement' },
  { key: 'AGREEMENT_SIGNED', label: 'Agreement Signed' },
  { key: 'STAFF_ALERT', label: 'Staff Alert' },
];

function StatusBadge({ active, configured }: { active: boolean; configured: boolean }) {
  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Not configured
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
        active
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-red-50 text-red-700 border-red-200'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
      />
      {active ? 'Connected' : 'Disabled'}
    </span>
  );
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
        enabled ? 'bg-violet-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
      setInput('');
    }
  };

  const remove = (val: string) => onChange(values.filter((v) => v !== val));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-sm hover:bg-violet-100 transition-colors"
        >
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((val) => (
            <span
              key={val}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 border border-gray-200 text-sm text-gray-700"
            >
              {val}
              <button
                type="button"
                onClick={() => remove(val)}
                className="text-gray-400 hover:text-red-600 transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Small reusable helper ────────────────────────────────────────── */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      className={`w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 ${mono ? 'font-mono' : ''}`}
    />
  );
}

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('messaging');
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  /* Zenforge (content generation + posting, external service) */
  const [zenforgeConfig, setZenforgeConfig] = useState<ZenforgeConfig>({ baseUrl: '', apiSecret: '' });
  const [zenforgeConfigured, setZenforgeConfigured] = useState(false);

  /* Email */
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    provider: 'RESEND',
    enabled: true,
    fromName: '',
    fromEmail: '',
    configured: false,
  });

  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    botToken: '',
    chatIds: [],
    notificationTriggers: [],
  });
  const [telegramConfigured, setTelegramConfigured] = useState(false);

  const [waEnabled, setWaEnabled] = useState(false);
  const [waConfig, setWaConfig] = useState<WhatsAppConfig>({
    phoneNumberId: '',
    accessToken: '',
    wabaId: '',
    recipients: [],
    notificationTriggers: [],
  });
  const [waConfigured, setWaConfigured] = useState(false);

  /* AI providers — one entry per provider key, keyed by provider */
  const [aiProviders, setAiProviders] = useState<
    Record<string, { enabled: boolean; configured: boolean; credentials: Record<string, string>; model?: string }>
  >({});

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [allBusinesses, setAllBusinesses] = useState<BusinessOption[]>([]);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const { data: integrationsRes } = useSWR(
    businessId ? (['/api/integrations', businessId] as const) : null,
    ([url, bId]: readonly [string, string]) =>
      fetch(url, { headers: { 'x-active-business-id': bId } }).then((r) => (r.ok ? r.json() : null))
  );

  useEffect(() => {
    const integrations = integrationsRes?.integrations as (IntegrationData & { provider: string })[] | undefined;
    if (!integrations) return;

    for (const integration of integrations) {
      if (integration.provider === 'TELEGRAM') {
        setTelegramEnabled(integration.isActive);
        setTelegramConfigured(true);
        const cfg = integration.config as Partial<TelegramConfig>;
        setTelegramConfig({
          botToken: cfg.botToken || '',
          chatIds: cfg.chatIds || [],
          notificationTriggers: cfg.notificationTriggers || [],
        });
      }
      if (integration.provider === 'WHATSAPP') {
        setWaEnabled(integration.isActive);
        setWaConfigured(true);
        const cfg = integration.config as Partial<WhatsAppConfig>;
        setWaConfig({
          phoneNumberId: cfg.phoneNumberId || '',
          accessToken: cfg.accessToken || '',
          wabaId: cfg.wabaId || '',
          recipients: cfg.recipients || [],
          notificationTriggers: cfg.notificationTriggers || [],
        });
      }
      if (integration.provider === 'ZENFORGE') {
        setZenforgeConfigured(true);
        const cfg = integration.config as Partial<ZenforgeConfig>;
        setZenforgeConfig({ baseUrl: cfg.baseUrl || '', apiSecret: cfg.apiSecret || '' });
      }
      if (integration.provider === 'EMAIL') {
        const cfg = integration.config as Partial<EmailConfig>;
        setEmailConfig({
          provider: cfg.provider || 'SMTP',
          enabled: integration.isActive,
          fromName: cfg.fromName || '',
          fromEmail: cfg.fromEmail || '',
          smtpHost: cfg.smtpHost || '',
          smtpPort: cfg.smtpPort || '587',
          smtpUser: cfg.smtpUser || '',
          smtpPass: cfg.smtpPass || '',
          apiKey: cfg.apiKey || '',
          mailgunDomain: cfg.mailgunDomain || '',
          sesRegion: cfg.sesRegion || 'us-east-1',
          resendApiKey: cfg.resendApiKey || '',
          resendFromEmail: cfg.resendFromEmail || '',
          configured: true,
        });
      }
      if (AI_PROVIDERS.some((p) => p.key === integration.provider)) {
        const cfg = integration.config as { credentials?: Record<string, string>; model?: string };
        setAiProviders((prev) => ({
          ...prev,
          [integration.provider]: {
            enabled: integration.isActive,
            configured: true,
            credentials: cfg.credentials || {},
            model: cfg.model,
          },
        }));
      }
    }
  }, [integrationsRes]);

  const saveAiProvider = async (providerKey: string) => {
    if (!businessId) { showToast('No active business selected', 'error'); return; }
    const entry = aiProviders[providerKey];
    if (!entry) return;
    setSaving(providerKey);
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerKey,
          businessId,
          config: { credentials: entry.credentials, model: entry.model },
          isActive: entry.enabled,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setAiProviders((prev) => ({ ...prev, [providerKey]: { ...entry, configured: true } }));
      showToast(`${providerKey} saved`, 'success');
    } catch {
      showToast(`Failed to save ${providerKey}`, 'error');
    } finally {
      setSaving(null);
    }
  };

  const saveZenforgeConfig = async () => {
    if (!businessId) { showToast('No active business selected', 'error'); return; }
    setSaving('ZENFORGE');
    try {
      const res = await fetch('/api/integrations/ZENFORGE', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-active-business-id': businessId },
        body: JSON.stringify({ config: zenforgeConfig, isActive: true }),
      });
      let ok = res.ok;
      if (res.status === 404) {
        const createRes = await fetch('/api/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'ZENFORGE', businessId, config: zenforgeConfig, isActive: true }),
        });
        ok = createRes.ok;
      }
      if (!ok) throw new Error('Save failed');
      setZenforgeConfigured(true);
      showToast('Zenforge connection saved', 'success');
    } catch {
      showToast('Failed to save Zenforge connection', 'error');
    } finally {
      setSaving(null);
    }
  };

  const testZenforgeConnection = async () => {
    if (!businessId) { showToast('No active business selected', 'error'); return; }
    setTesting('ZENFORGE');
    try {
      const res = await fetch('/api/admin/zenforge/status', { headers: { 'x-active-business-id': businessId } });
      if (!res.ok) throw new Error();
      showToast('Connected to Zenforge', 'success');
    } catch {
      showToast('Could not reach Zenforge — check the URL and secret', 'error');
    } finally {
      setTesting(null);
    }
  };

  const saveEmail = async () => {
    if (!businessId) { showToast('No active business selected', 'error'); return; }
    setSaving('email');
    try {
      const res = await fetch('/api/integrations/EMAIL', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-active-business-id': businessId },
        body: JSON.stringify({ config: emailConfig, isActive: emailConfig.enabled }),
      });
      if (res.status === 404) {
        await fetch('/api/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'EMAIL', businessId, config: emailConfig, isActive: emailConfig.enabled }),
        });
      }
      setEmailConfig((p) => ({ ...p, configured: true }));
      showToast('Email configuration saved', 'success');
    } catch {
      showToast('Failed to save email config', 'error');
    } finally {
      setSaving(null);
    }
  };

  const testEmail = async () => {
    setTesting('email');
    try {
      const res = await fetch('/api/integrations/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(businessId ? { 'x-active-business-id': businessId } : {}) },
        body: JSON.stringify({ toEmail: emailConfig.fromEmail }),
      });
      if (!res.ok) throw new Error('Test failed');
      showToast('Test email sent — check your inbox', 'success');
    } catch {
      showToast('Email test failed — check credentials', 'error');
    } finally {
      setTesting(null);
    }
  };

  const { data: meRes } = useSWR('/api/auth/me');

  useEffect(() => {
    if (!meRes) return;
    // Real /api/auth/me shape is { success, user: { isSuperAdmin,
    // activeBusinessId, ... }, businesses: [...] } — this previously
    // read d.businessId / d.isSuperAdmin at the root, which don't exist
    // on that response, so businessId was always silently null/wrong
    // and there was no way to pick a business. Super admins now default
    // to "All Businesses" (null) instead of an auto-picked business.
    const superAdmin = !!meRes?.user?.isSuperAdmin;
    const businesses: BusinessOption[] = meRes?.businesses || [];
    setIsSuperAdmin(superAdmin);
    setAllBusinesses(businesses);

    const bId: string | null =
      meRes?.user?.activeBusinessId || (superAdmin ? null : businesses?.[0]?._id || null);
    setBusinessId(bId);
  }, [meRes]);

  const handleSelectBusiness = (bId: string) => {
    setBusinessId(bId || null);
  };

  const saveTelegram = async () => {
    if (!businessId) {
      showToast('No active business selected', 'error');
      return;
    }
    setSaving('telegram');
    try {
      const res = await fetch('/api/integrations/TELEGRAM', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-active-business-id': businessId,
        },
        body: JSON.stringify({
          config: telegramConfig,
          isActive: telegramEnabled,
        }),
      });
      if (res.status === 404) {
        const createRes = await fetch('/api/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'TELEGRAM',
            businessId,
            config: telegramConfig,
            isActive: telegramEnabled,
          }),
        });
        if (!createRes.ok) throw new Error('Failed to save');
      } else if (!res.ok) {
        throw new Error('Failed to save');
      }
      setTelegramConfigured(true);
      showToast('Telegram configuration saved', 'success');
    } catch {
      showToast('Failed to save Telegram config', 'error');
    } finally {
      setSaving(null);
    }
  };

  const testTelegram = async () => {
    setTesting('telegram');
    try {
      const res = await fetch('/api/integrations/telegram/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(businessId ? { 'x-active-business-id': businessId } : {}),
        },
        body: JSON.stringify({ message: 'Test message from ANGroup ERP' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test failed');
      const { summary } = data;
      showToast(
        `Telegram test: ${summary.success}/${summary.total} messages delivered`,
        summary.success > 0 ? 'success' : 'error'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Test failed', 'error');
    } finally {
      setTesting(null);
    }
  };

  const saveWhatsApp = async () => {
    if (!businessId) {
      showToast('No active business selected', 'error');
      return;
    }
    setSaving('whatsapp');
    try {
      const res = await fetch('/api/integrations/WHATSAPP', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-active-business-id': businessId,
        },
        body: JSON.stringify({
          config: waConfig,
          isActive: waEnabled,
        }),
      });
      if (res.status === 404) {
        const createRes = await fetch('/api/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'WHATSAPP',
            businessId,
            config: waConfig,
            isActive: waEnabled,
          }),
        });
        if (!createRes.ok) throw new Error('Failed to save');
      } else if (!res.ok) {
        throw new Error('Failed to save');
      }
      setWaConfigured(true);
      showToast('WhatsApp configuration saved', 'success');
    } catch {
      showToast('Failed to save WhatsApp config', 'error');
    } finally {
      setSaving(null);
    }
  };

  const testWhatsApp = async () => {
    setTesting('whatsapp');
    try {
      const res = await fetch('/api/integrations/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(businessId ? { 'x-active-business-id': businessId } : {}),
        },
        body: JSON.stringify({ message: 'Test message from ANGroup ERP' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test failed');
      const { summary } = data;
      showToast(
        `WhatsApp test: ${summary.success}/${summary.total} messages delivered`,
        summary.success > 0 ? 'success' : 'error'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Test failed', 'error');
    } finally {
      setTesting(null);
    }
  };

  const toggleTrigger = (
    key: string,
    triggers: string[],
    setConfig: (fn: (prev: TelegramConfig | WhatsAppConfig) => TelegramConfig | WhatsAppConfig) => void
  ) => {
    const next = triggers.includes(key)
      ? triggers.filter((t) => t !== key)
      : [...triggers, key];
    setConfig((prev) => ({ ...prev, notificationTriggers: next }));
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'messaging', label: 'Messaging', icon: '💬' },
    { id: 'zenforge', label: 'Zenforge', icon: '🎬' },
    { id: 'email', label: 'Email', icon: '✉️' },
    { id: 'ai', label: 'AI', icon: '🤖' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
            <p className="mt-1 text-sm text-gray-500">
              Connect messaging platforms and social channels to receive real-time ERP notifications.
            </p>
          </div>
          {isSuperAdmin && allBusinesses.length > 0 && (
            <select
              value={businessId ?? ''}
              onChange={(e) => handleSelectBusiness(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
            >
              <option value="">All Businesses…</option>
              {allBusinesses.map((b) => (
                <option key={b._id} value={b._id}>{b.brandName || b.name}</option>
              ))}
            </select>
          )}
        </div>

        {!businessId ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-500 text-sm">
            {isSuperAdmin && allBusinesses.length > 0
              ? 'Select a business above to view and manage its integrations.'
              : 'No active business selected — select a business to manage its integrations.'}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-6 p-1 bg-white border border-gray-200 rounded-xl w-fit">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <span className="mr-1.5">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Messaging Tab */}
            {activeTab === 'messaging' && (
              <div className="space-y-6">
                {/* Telegram Section */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-lg">
                        ✈️
                      </div>
                      <div>
                        <h2 className="font-semibold text-gray-900">Telegram</h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Send notifications via Telegram Bot API
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge active={telegramEnabled} configured={telegramConfigured} />
                      <Toggle enabled={telegramEnabled} onChange={setTelegramEnabled} />
                    </div>
                  </div>

                  <div className="px-6 py-5 space-y-5">
                    {/* Bot Token */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                        Bot Token
                      </label>
                      <input
                        type="text"
                        value={telegramConfig.botToken}
                        onChange={(e) =>
                          setTelegramConfig((p) => ({ ...p, botToken: e.target.value }))
                        }
                        placeholder="1234567890:ABCdefGhIJKlmnoPQRsTUVwxyz"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Obtain from @BotFather on Telegram
                      </p>
                    </div>

                    {/* Chat IDs */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                        Chat IDs / Channel IDs
                      </label>
                      <TagInput
                        values={telegramConfig.chatIds}
                        onChange={(chatIds) => setTelegramConfig((p) => ({ ...p, chatIds }))}
                        placeholder="Enter chat ID (e.g. -1001234567890)"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Add individual user IDs, group IDs, or channel IDs
                      </p>
                    </div>

                    {/* Notification Triggers */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                        Notification Triggers
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {NOTIFICATION_EVENTS.map((ev) => {
                          const checked = telegramConfig.notificationTriggers.includes(ev.key);
                          return (
                            <label
                              key={ev.key}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                                checked
                                  ? 'bg-violet-50 border-violet-200 text-violet-700'
                                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() =>
                                  toggleTrigger(
                                    ev.key,
                                    telegramConfig.notificationTriggers,
                                    setTelegramConfig as (fn: (prev: TelegramConfig | WhatsAppConfig) => TelegramConfig | WhatsAppConfig) => void
                                  )
                                }
                              />
                              <span
                                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                  checked
                                    ? 'bg-violet-600 border-violet-600'
                                    : 'border-gray-300'
                                }`}
                              >
                                {checked && (
                                  <svg
                                    className="w-2.5 h-2.5 text-white"
                                    viewBox="0 0 10 10"
                                    fill="none"
                                  >
                                    <path
                                      d="M1.5 5L4 7.5L8.5 3"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </span>
                              {ev.label}
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">
                        Leave all unchecked to receive all event types
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={saveTelegram}
                        disabled={saving === 'telegram'}
                        className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                      >
                        {saving === 'telegram' ? 'Saving...' : 'Save Configuration'}
                      </button>
                      <button
                        onClick={testTelegram}
                        disabled={testing === 'telegram' || !telegramConfigured}
                        className="px-4 py-2 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 border border-gray-200 text-gray-700 text-sm font-medium transition-colors"
                      >
                        {testing === 'telegram' ? 'Testing...' : 'Test Connection'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Section */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-lg">
                        📞
                      </div>
                      <div>
                        <h2 className="font-semibold text-gray-900">WhatsApp Business</h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Send notifications via WhatsApp Business API
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge active={waEnabled} configured={waConfigured} />
                      <Toggle enabled={waEnabled} onChange={setWaEnabled} />
                    </div>
                  </div>

                  <div className="px-6 py-5 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Phone Number ID */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                          Phone Number ID
                        </label>
                        <input
                          type="text"
                          value={waConfig.phoneNumberId}
                          onChange={(e) =>
                            setWaConfig((p) => ({ ...p, phoneNumberId: e.target.value }))
                          }
                          placeholder="123456789012345"
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono"
                        />
                      </div>

                      {/* WABA ID */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                          WABA ID
                        </label>
                        <input
                          type="text"
                          value={waConfig.wabaId}
                          onChange={(e) =>
                            setWaConfig((p) => ({ ...p, wabaId: e.target.value }))
                          }
                          placeholder="WhatsApp Business Account ID"
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono"
                        />
                      </div>
                    </div>

                    {/* Access Token */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                        Access Token
                      </label>
                      <input
                        type="text"
                        value={waConfig.accessToken}
                        onChange={(e) =>
                          setWaConfig((p) => ({ ...p, accessToken: e.target.value }))
                        }
                        placeholder="EAAxxxxxxxxxx..."
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Permanent token from Meta Business Suite
                      </p>
                    </div>

                    {/* Recipients */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                        Default Recipients
                      </label>
                      <TagInput
                        values={waConfig.recipients}
                        onChange={(recipients) => setWaConfig((p) => ({ ...p, recipients }))}
                        placeholder="Enter phone with country code (e.g. 971501234567)"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Include country code without + (e.g. 971501234567 for UAE)
                      </p>
                    </div>

                    {/* Notification Triggers */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                        Notification Triggers
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {NOTIFICATION_EVENTS.map((ev) => {
                          const checked = waConfig.notificationTriggers.includes(ev.key);
                          return (
                            <label
                              key={ev.key}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                                checked
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() =>
                                  toggleTrigger(
                                    ev.key,
                                    waConfig.notificationTriggers,
                                    setWaConfig as (fn: (prev: TelegramConfig | WhatsAppConfig) => TelegramConfig | WhatsAppConfig) => void
                                  )
                                }
                              />
                              <span
                                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                  checked
                                    ? 'bg-emerald-600 border-emerald-600'
                                    : 'border-gray-300'
                                }`}
                              >
                                {checked && (
                                  <svg
                                    className="w-2.5 h-2.5 text-white"
                                    viewBox="0 0 10 10"
                                    fill="none"
                                  >
                                    <path
                                      d="M1.5 5L4 7.5L8.5 3"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </span>
                              {ev.label}
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">
                        Leave all unchecked to receive all event types
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={saveWhatsApp}
                        disabled={saving === 'whatsapp'}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                      >
                        {saving === 'whatsapp' ? 'Saving...' : 'Save Configuration'}
                      </button>
                      <button
                        onClick={testWhatsApp}
                        disabled={testing === 'whatsapp' || !waConfigured}
                        className="px-4 py-2 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 border border-gray-200 text-gray-700 text-sm font-medium transition-colors"
                      >
                        {testing === 'whatsapp' ? 'Testing...' : 'Test Connection'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Notification Routing Info */}
                <div className="bg-violet-50 border border-violet-200 rounded-2xl px-6 py-4">
                  <h3 className="text-sm font-semibold text-violet-700 mb-1">
                    Notification Routing
                  </h3>
                  <p className="text-xs text-violet-600/80 leading-relaxed">
                    Other ERP modules (Orders, Inventory, Agreements, Invoices) use the{' '}
                    <code className="bg-violet-100 px-1 py-0.5 rounded text-violet-700 font-mono text-xs">
                      /api/integrations/notify
                    </code>{' '}
                    endpoint to dispatch alerts. Enable the channels above and configure triggers
                    to control which events are forwarded to each platform.
                  </p>
                </div>
              </div>
            )}

            {/* Zenforge Tab */}
            {activeTab === 'zenforge' && (
              <div className="space-y-6">
                <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-3 text-xs text-violet-700/90 leading-relaxed">
                  <strong className="text-violet-700">How it works:</strong> Content generation and
                  posting (YouTube, Facebook, Instagram, LinkedIn, Twitter/X) all live in the separate
                  Zenforge project now, not in ANgroup. Connect it here with its deployed URL and the
                  shared API secret (set as <code className="font-mono">API_SECRET</code> in Zenforge's
                  env vars) — ANgroup then only monitors and controls it, it never stores platform
                  credentials itself.
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-lg">
                        🎬
                      </div>
                      <div>
                        <h2 className="font-semibold text-gray-900">Zenforge</h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Automated content pipeline + multi-platform posting
                        </p>
                      </div>
                    </div>
                    <StatusBadge active={zenforgeConfigured} configured={zenforgeConfigured} />
                  </div>

                  <div className="px-6 py-5 space-y-4">
                    <Field label="Zenforge base URL" hint="Your deployed Vercel URL, e.g. https://zenforge.vercel.app">
                      <TextInput
                        value={zenforgeConfig.baseUrl}
                        onChange={(v) => setZenforgeConfig((p) => ({ ...p, baseUrl: v }))}
                        placeholder="https://zenforge.vercel.app"
                        mono
                      />
                    </Field>
                    <Field label="API secret" hint="Same value as Zenforge's API_SECRET env var">
                      <TextInput
                        value={zenforgeConfig.apiSecret}
                        onChange={(v) => setZenforgeConfig((p) => ({ ...p, apiSecret: v }))}
                        placeholder="API secret"
                        mono
                        type="password"
                      />
                    </Field>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={saveZenforgeConfig}
                        disabled={saving === 'ZENFORGE'}
                        className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-medium"
                      >
                        {saving === 'ZENFORGE' ? 'Saving…' : 'Save connection'}
                      </button>
                      <button
                        onClick={testZenforgeConnection}
                        disabled={testing === 'ZENFORGE' || !zenforgeConfigured}
                        className="px-4 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 disabled:opacity-40 border border-gray-200 text-gray-700 text-sm font-medium"
                      >
                        {testing === 'ZENFORGE' ? 'Testing…' : 'Test connection'}
                      </button>
                      {zenforgeConfigured && (
                        <Link
                          href="/console/zenforge"
                          className="ml-auto px-4 py-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-sm font-medium hover:bg-violet-100"
                        >
                          Open Zenforge dashboard →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI Tab — centralized credentials hub */}
            {activeTab === 'ai' && (
              <div className="space-y-6">
                <p className="text-sm text-gray-500 max-w-2xl">
                  Add your AI provider credentials once here. AN Dev Studio and any other app/tool you
                  point at this business's AI Hub endpoint (<code className="font-mono">/api/ai/hub/complete</code>)
                  will fetch and use them automatically, falling back down the list if one fails or its
                  free tier is exhausted — no need to paste keys into every app separately.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {AI_PROVIDERS.map((meta) => {
                    const entry = aiProviders[meta.key] || { enabled: false, configured: false, credentials: {} };
                    return (
                      <div key={meta.key} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{meta.icon}</span>
                            <h2 className="font-semibold text-gray-900">{meta.label}</h2>
                          </div>
                          <StatusBadge active={entry.enabled} configured={entry.configured} />
                        </div>
                        <p className="text-xs text-gray-400">{meta.hint}</p>
                        {meta.fields.map((f) => (
                          <Field key={f.key} label={f.label}>
                            <TextInput
                              value={f.key === 'model' ? entry.model || '' : entry.credentials[f.key] || ''}
                              onChange={(v) =>
                                setAiProviders((prev) => {
                                  const cur = prev[meta.key] || { enabled: false, configured: false, credentials: {} };
                                  return {
                                    ...prev,
                                    [meta.key]:
                                      f.key === 'model'
                                        ? { ...cur, model: v }
                                        : { ...cur, credentials: { ...cur.credentials, [f.key]: v } },
                                  };
                                })
                              }
                              placeholder={f.placeholder}
                              mono={f.secret}
                              type={f.secret ? 'password' : 'text'}
                            />
                          </Field>
                        ))}
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-2">
                            <Toggle
                              enabled={entry.enabled}
                              onChange={(v) =>
                                setAiProviders((prev) => ({
                                  ...prev,
                                  [meta.key]: { ...(prev[meta.key] || { configured: false, credentials: {} }), enabled: v },
                                }))
                              }
                            />
                            <span className="text-sm text-gray-500">Active</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => saveAiProvider(meta.key)}
                            disabled={saving === meta.key}
                            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-40"
                          >
                            {saving === meta.key ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Email Tab */}
            {activeTab === 'email' && (
              <div className="space-y-6">
                {/* Provider selector */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-lg">
                        ✉️
                      </div>
                      <div>
                        <h2 className="font-semibold text-gray-900">Email Provider</h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Send transactional emails — invoices, alerts, agreements
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge active={emailConfig.enabled} configured={emailConfig.configured} />
                      <Toggle enabled={emailConfig.enabled} onChange={(v) => setEmailConfig((p) => ({ ...p, enabled: v }))} />
                    </div>
                  </div>

                  <div className="px-6 py-5 space-y-5">
                    {/* Provider choice */}
                    <Field label="Provider">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {(['SMTP', 'SENDGRID', 'MAILGUN', 'SES', 'RESEND'] as const).map((p) => (
                          <button
                            key={p}
                            onClick={() => setEmailConfig((prev) => ({ ...prev, provider: p }))}
                            className={`py-2 rounded-lg border text-sm font-medium transition-all ${
                              emailConfig.provider === p
                                ? 'bg-violet-50 border-violet-300 text-violet-700'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            {p === 'SMTP' ? 'SMTP' : p === 'SENDGRID' ? 'SendGrid' : p === 'MAILGUN' ? 'Mailgun' : p === 'SES' ? 'AWS SES' : 'Resend'}
                          </button>
                        ))}
                      </div>
                    </Field>

                    {/* Shared from fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="From Name">
                        <TextInput value={emailConfig.fromName} onChange={(v) => setEmailConfig((p) => ({ ...p, fromName: v }))} placeholder="AN Group ERP" />
                      </Field>
                      <Field label="From Email">
                        <TextInput value={emailConfig.fromEmail} onChange={(v) => setEmailConfig((p) => ({ ...p, fromEmail: v }))} placeholder="noreply@yourdomain.com" type="email" />
                      </Field>
                    </div>

                    {/* SMTP fields */}
                    {emailConfig.provider === 'SMTP' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="col-span-2">
                            <Field label="SMTP Host" hint="e.g. smtp.gmail.com / mail.yourdomain.com">
                              <TextInput value={emailConfig.smtpHost || ''} onChange={(v) => setEmailConfig((p) => ({ ...p, smtpHost: v }))} placeholder="smtp.example.com" mono />
                            </Field>
                          </div>
                          <Field label="Port" hint="Usually 587 (TLS) or 465 (SSL)">
                            <TextInput value={emailConfig.smtpPort || '587'} onChange={(v) => setEmailConfig((p) => ({ ...p, smtpPort: v }))} placeholder="587" mono />
                          </Field>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="SMTP Username">
                            <TextInput value={emailConfig.smtpUser || ''} onChange={(v) => setEmailConfig((p) => ({ ...p, smtpUser: v }))} placeholder="user@example.com" mono />
                          </Field>
                          <Field label="SMTP Password / App Password">
                            <TextInput value={emailConfig.smtpPass || ''} onChange={(v) => setEmailConfig((p) => ({ ...p, smtpPass: v }))} placeholder="••••••••••••" type="password" mono />
                          </Field>
                        </div>
                      </div>
                    )}

                    {/* SendGrid */}
                    {emailConfig.provider === 'SENDGRID' && (
                      <Field label="SendGrid API Key" hint="Create at sendgrid.com → Settings → API Keys">
                        <TextInput value={emailConfig.apiKey || ''} onChange={(v) => setEmailConfig((p) => ({ ...p, apiKey: v }))} placeholder="SG.xxxxxxxxxxxxxx" type="password" mono />
                      </Field>
                    )}

                    {/* Mailgun */}
                    {emailConfig.provider === 'MAILGUN' && (
                      <div className="space-y-4">
                        <Field label="Mailgun API Key" hint="Found in Mailgun dashboard → API Keys">
                          <TextInput value={emailConfig.apiKey || ''} onChange={(v) => setEmailConfig((p) => ({ ...p, apiKey: v }))} placeholder="key-xxxxxxxxxxxxxxxx" type="password" mono />
                        </Field>
                        <Field label="Mailgun Domain" hint="Your sending domain registered in Mailgun">
                          <TextInput value={emailConfig.mailgunDomain || ''} onChange={(v) => setEmailConfig((p) => ({ ...p, mailgunDomain: v }))} placeholder="mg.yourdomain.com" mono />
                        </Field>
                      </div>
                    )}

                    {/* SES */}
                    {emailConfig.provider === 'SES' && (
                      <div className="space-y-4">
                        <Field label="AWS Access Key ID">
                          <TextInput value={emailConfig.apiKey || ''} onChange={(v) => setEmailConfig((p) => ({ ...p, apiKey: v }))} placeholder="AKIAIOSFODNN7EXAMPLE" mono />
                        </Field>
                        <Field label="AWS Region" hint="Region where SES is configured">
                          <TextInput value={emailConfig.sesRegion || 'us-east-1'} onChange={(v) => setEmailConfig((p) => ({ ...p, sesRegion: v }))} placeholder="us-east-1" mono />
                        </Field>
                      </div>
                    )}

                    {/* Resend — used for order/invoice emails via services/email/resend.service.ts */}
                    {emailConfig.provider === 'RESEND' && (
                      <div className="space-y-4">
                        <Field label="Resend API Key" hint="Create at resend.com → API Keys. Falls back to the platform default key until set.">
                          <TextInput value={emailConfig.resendApiKey || ''} onChange={(v) => setEmailConfig((p) => ({ ...p, resendApiKey: v }))} placeholder="re_xxxxxxxxxxxxxxxx" type="password" mono />
                        </Field>
                        <Field label="Resend From Email" hint="Must be a verified domain in Resend. Falls back to 'From Email' above if left blank.">
                          <TextInput value={emailConfig.resendFromEmail || ''} onChange={(v) => setEmailConfig((p) => ({ ...p, resendFromEmail: v }))} placeholder="orders@yourdomain.com" type="email" mono />
                        </Field>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={saveEmail}
                        disabled={saving === 'email'}
                        className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-medium"
                      >
                        {saving === 'email' ? 'Saving…' : 'Save Configuration'}
                      </button>
                      <button
                        onClick={testEmail}
                        disabled={testing === 'email' || !emailConfig.configured}
                        className="px-4 py-2 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 border border-gray-200 text-gray-700 text-sm font-medium"
                      >
                        {testing === 'email' ? 'Sending…' : 'Send Test Email'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
