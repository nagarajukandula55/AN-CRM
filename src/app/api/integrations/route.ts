// Route: /api/integrations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Integration, { IntegrationConfig, TelegramConfig, WhatsAppConfig, EmailConfig, ZenforgeConfig, AiProviderConfig, AI_PROVIDER_KEYS } from '@/models/Integration';
import { logAction } from '@/lib/audit/logAction';
import { learnIntegrationStatus } from '@/services/anuAutoLearn.service';

function maskConfig(provider: string, config: IntegrationConfig): IntegrationConfig {
  if (!config) return config;

  switch (provider) {
    case 'TELEGRAM': {
      const c = config as TelegramConfig;
      return {
        ...c,
        botToken: c.botToken
          ? `...${c.botToken.slice(-4)}`
          : c.botToken,
      };
    }
    case 'WHATSAPP': {
      const c = config as WhatsAppConfig;
      return {
        ...c,
        accessToken: c.accessToken
          ? `...${c.accessToken.slice(-4)}`
          : c.accessToken,
      };
    }
    case 'EMAIL': {
      const c = config as EmailConfig;
      return {
        ...c,
        smtpPass: c.smtpPass ? '***' : c.smtpPass,
        resendApiKey: c.resendApiKey ? `...${c.resendApiKey.slice(-4)}` : c.resendApiKey,
      };
    }
    case 'ZENFORGE': {
      const c = config as ZenforgeConfig;
      return {
        ...c,
        apiSecret: c.apiSecret ? `...${c.apiSecret.slice(-4)}` : c.apiSecret,
      };
    }
    default: {
      if ((AI_PROVIDER_KEYS as string[]).includes(provider)) {
        const c = config as AiProviderConfig;
        return {
          ...c,
          credentials: Object.fromEntries(
            Object.entries(c.credentials || {}).map(([k, v]) => [
              k,
              v ? `...${v.slice(-4)}` : v,
            ]),
          ),
        };
      }
      return config;
    }
  }
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const businessId =
    req.headers.get('x-active-business-id') ||
    req.nextUrl.searchParams.get('businessId');

  await connectDB();

  const rawIntegrations = await Integration.find({ businessId }).lean();

  const integrations = rawIntegrations.map((integration) => ({
    ...integration,
    config: maskConfig(integration.provider, integration.config as IntegrationConfig),
  }));

  return NextResponse.json({ success: true, integrations });
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { provider, config, isActive, businessId } = body;

  if (!provider || !businessId) {
    return NextResponse.json(
      { error: 'provider and businessId are required' },
      { status: 400 }
    );
  }

  await connectDB();

  // If the botToken looks masked (starts with "..."), fetch the existing value
  // so we don't overwrite the real token with a masked placeholder
  let finalConfig = { ...config };

  if (provider === 'TELEGRAM' && config?.botToken?.startsWith('...')) {
    const existing = await Integration.findOne({ businessId, provider }).lean();
    if (existing?.config) {
      finalConfig.botToken = (existing.config as TelegramConfig).botToken;
    }
  }

  if (provider === 'WHATSAPP' && config?.accessToken?.startsWith('...')) {
    const existing = await Integration.findOne({ businessId, provider }).lean();
    if (existing?.config) {
      finalConfig.accessToken = (existing.config as WhatsAppConfig).accessToken;
    }
  }

  if ((AI_PROVIDER_KEYS as string[]).includes(provider) && config?.credentials) {
    const anyMasked = Object.values(config.credentials as Record<string, string>).some(
      (v) => typeof v === 'string' && v.startsWith('...'),
    );
    if (anyMasked) {
      const existing = await Integration.findOne({ businessId, provider }).lean();
      const existingCreds = (existing?.config as AiProviderConfig | undefined)?.credentials || {};
      finalConfig.credentials = Object.fromEntries(
        Object.entries(config.credentials as Record<string, string>).map(([k, v]) => [
          k,
          typeof v === 'string' && v.startsWith('...') ? existingCreds[k] : v,
        ]),
      );
    }
  }

  const integration = await Integration.findOneAndUpdate(
    { businessId, provider },
    {
      $set: {
        config: finalConfig,
        ...(isActive !== undefined ? { isActive } : {}),
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  logAction({
    action: "CREATE",
    entity: "Integration",
    entityId: integration?._id?.toString(),
    after: integration,
    req,
  });

  learnIntegrationStatus({ businessId, provider, isActive: !!integration?.isActive });

  return NextResponse.json({ success: true, integration });
}
