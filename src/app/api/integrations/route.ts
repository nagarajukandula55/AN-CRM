// Route: /api/integrations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Integration, { IntegrationConfig, TelegramConfig, WhatsAppConfig, EmailConfig, ZenforgeConfig, AiProviderConfig, AI_PROVIDER_KEYS } from '@/models/Integration';
import { logAction } from '@/lib/audit/logAction';
import { learnIntegrationStatus } from '@/services/anuAutoLearn.service';
import { getEnrichedSession } from '@/lib/auth/session-enriched';
import { resolveAuthorizedBusinessId } from '@/lib/auth/resolveAuthorizedBusinessId';

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

  await connectDB();

  // SECURITY: businessId used to be trusted straight from the header/
  // query param with no ownership check -- any authenticated user could
  // view (masked, but still) another business's Telegram/WhatsApp/Email/
  // AI provider integration config just by passing its businessId. See
  // lib/auth/resolveAuthorizedBusinessId.ts.
  const session = await getEnrichedSession();
  const businessId = await resolveAuthorizedBusinessId(
    userId,
    req.headers.get('x-active-business-id') || req.nextUrl.searchParams.get('businessId'),
    !!session?.isSuperAdmin,
    session?.business?.businessId || null
  );
  if (!businessId) {
    return NextResponse.json({ success: true, integrations: [] });
  }

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
  const { provider, config, isActive } = body;

  if (!provider || !body.businessId) {
    return NextResponse.json(
      { error: 'provider and businessId are required' },
      { status: 400 }
    );
  }

  await connectDB();

  // SECURITY: businessId used to be trusted straight from the request
  // body with no ownership check -- any authenticated user could
  // OVERWRITE another business's Telegram bot token, WhatsApp access
  // token, SMTP/Resend key, or AI provider credentials just by naming
  // its businessId. This is the most severe version of the bug fixed
  // across this whole sweep -- not just reading data, hijacking a
  // credential.
  const session = await getEnrichedSession();
  const businessId = await resolveAuthorizedBusinessId(
    userId,
    body.businessId,
    !!session?.isSuperAdmin,
    session?.business?.businessId || null
  );
  if (!businessId) {
    return NextResponse.json({ error: 'No business context for this account' }, { status: 400 });
  }

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
