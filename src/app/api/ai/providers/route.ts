import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import AIConfig from '@/models/AIConfig'
import { logAction } from '@/lib/audit/logAction'
import { learnAiProviderStatus } from '@/services/anuAutoLearn.service'

function maskApiKey(key: string | undefined): string | null {
  if (!key) return null
  if (key.length <= 4) return '...' + key
  return '...' + key.slice(-4)
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = req.headers.get('x-active-business-id')

  await connectDB()

  const config = businessId
    ? await AIConfig.findOne({ businessId }).lean()
    : null

  const defaultProviders = {
    openai: { apiKey: null, isEnabled: false, model: 'gpt-4o' },
    anthropic: { apiKey: null, isEnabled: false, model: 'claude-3-5-sonnet-20241022' },
    google: { apiKey: null, isEnabled: false, model: 'gemini-1.5-pro' },
    stabilityai: { apiKey: null, isEnabled: false },
    openrouter: { apiKey: null, isEnabled: false, model: '' },
  }

  if (!config) {
    return NextResponse.json({
      success: true,
      config: {
        providers: defaultProviders,
        defaultImageProvider: 'openai',
        defaultTextProvider: 'openai',
      },
    })
  }

  const maskedConfig = {
    providers: {
      openai: {
        apiKey: maskApiKey(config.providers?.openai?.apiKey),
        isEnabled: config.providers?.openai?.isEnabled ?? false,
        model: config.providers?.openai?.model ?? 'gpt-4o',
      },
      anthropic: {
        apiKey: maskApiKey(config.providers?.anthropic?.apiKey),
        isEnabled: config.providers?.anthropic?.isEnabled ?? false,
        model: config.providers?.anthropic?.model ?? 'claude-3-5-sonnet-20241022',
      },
      google: {
        apiKey: maskApiKey(config.providers?.google?.apiKey),
        isEnabled: config.providers?.google?.isEnabled ?? false,
        model: config.providers?.google?.model ?? 'gemini-1.5-pro',
      },
      stabilityai: {
        apiKey: maskApiKey(config.providers?.stabilityai?.apiKey),
        isEnabled: config.providers?.stabilityai?.isEnabled ?? false,
      },
      openrouter: {
        apiKey: maskApiKey(config.providers?.openrouter?.apiKey),
        isEnabled: config.providers?.openrouter?.isEnabled ?? false,
        model: config.providers?.openrouter?.model ?? '',
      },
    },
    defaultImageProvider: config.defaultImageProvider ?? 'openai',
    defaultTextProvider: config.defaultTextProvider ?? 'openai',
  }

  return NextResponse.json({ success: true, config: maskedConfig })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = req.headers.get('x-active-business-id')
  if (!businessId) {
    return NextResponse.json({ success: false, error: 'No active business' }, { status: 400 })
  }

  const body = await req.json()
  const { provider, apiKey, isEnabled, model, defaultImageProvider, defaultTextProvider } = body

  await connectDB()

  const updateFields: Record<string, unknown> = {
    updatedBy: userId,
  }

  if (defaultImageProvider !== undefined) {
    updateFields['defaultImageProvider'] = defaultImageProvider
  }

  if (defaultTextProvider !== undefined) {
    updateFields['defaultTextProvider'] = defaultTextProvider
  }

  if (provider) {
    const validProviders = ['openai', 'anthropic', 'google', 'stabilityai', 'openrouter']
    if (!validProviders.includes(provider)) {
      return NextResponse.json({ success: false, error: 'Invalid provider' }, { status: 400 })
    }

    if (isEnabled !== undefined) {
      updateFields[`providers.${provider}.isEnabled`] = isEnabled
    }

    if (model !== undefined && provider !== 'stabilityai') {
      updateFields[`providers.${provider}.model`] = model
    }

    // Only update the API key if it's a real key (not a masked placeholder)
    if (apiKey !== undefined && apiKey !== null) {
      const isMasked = typeof apiKey === 'string' && apiKey.startsWith('...')
      if (!isMasked && apiKey.trim() !== '') {
        updateFields[`providers.${provider}.apiKey`] = apiKey.trim()
      }
    }
  }

  const updatedConfig = await AIConfig.findOneAndUpdate(
    { businessId },
    { $set: updateFields },
    { upsert: true, new: true }
  )

  logAction({
    action: "UPDATE",
    entity: "AIConfig",
    entityId: updatedConfig?._id?.toString(),
    after: updateFields,
    req,
    actor: { businessId },
  });

  if (provider) {
    const enabledNow = (updatedConfig as any)?.providers?.[provider]?.isEnabled ?? false;
    learnAiProviderStatus({ businessId, provider, isEnabled: enabledNow });
  }

  return NextResponse.json({ success: true })
}
