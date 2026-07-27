import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import AIConfig from '@/models/AIConfig'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = req.headers.get('x-active-business-id')

  let body: { prompt?: string; style?: string; size?: string; provider?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { prompt, style, size, provider: requestedProvider } = body

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

  await connectDB()

  const config = businessId
    ? await AIConfig.findOne({ businessId }).lean()
    : null

  const provider = requestedProvider || config?.defaultImageProvider || 'openai'

  const enhancedPrompt = style ? `${prompt}. Style: ${style}` : prompt

  // OpenAI DALL-E
  if (provider === 'openai') {
    const openaiConfig = config?.providers?.openai
    if (!openaiConfig?.isEnabled || !openaiConfig?.apiKey) {
      return NextResponse.json(
        { error: 'No image generation provider configured. Please add an API key in AI Studio Settings.' },
        { status: 400 }
      )
    }

    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: enhancedPrompt,
          n: 1,
          size: size || '1024x1024',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message =
          (errorData as { error?: { message?: string } })?.error?.message ||
          `OpenAI API error: ${response.status} ${response.statusText}`
        return NextResponse.json({ error: message }, { status: response.status })
      }

      const data = (await response.json()) as { data?: { url?: string }[] }
      const imageUrl = data?.data?.[0]?.url
      if (!imageUrl) {
        return NextResponse.json({ error: 'No image returned from OpenAI' }, { status: 500 })
      }

      return NextResponse.json({ url: imageUrl })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate image with OpenAI'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Stability AI
  if (provider === 'stabilityai') {
    const stabilityConfig = config?.providers?.stabilityai
    if (!stabilityConfig?.isEnabled || !stabilityConfig?.apiKey) {
      return NextResponse.json(
        { error: 'No image generation provider configured. Please add an API key in AI Studio Settings.' },
        { status: 400 }
      )
    }

    try {
      const response = await fetch(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${stabilityConfig.apiKey}`,
          },
          body: JSON.stringify({
            text_prompts: [{ text: enhancedPrompt }],
            width: 1024,
            height: 1024,
            samples: 1,
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message =
          (errorData as { message?: string })?.message ||
          `Stability AI error: ${response.status} ${response.statusText}`
        return NextResponse.json({ error: message }, { status: response.status })
      }

      const data = (await response.json()) as {
        artifacts?: { base64?: string; finishReason?: string }[]
      }
      const artifact = data?.artifacts?.[0]
      if (!artifact?.base64) {
        return NextResponse.json({ error: 'No image returned from Stability AI' }, { status: 500 })
      }

      const dataUrl = `data:image/png;base64,${artifact.base64}`
      return NextResponse.json({ url: dataUrl })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate image with Stability AI'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return NextResponse.json(
    { error: 'No image generation provider configured. Please add an API key in AI Studio Settings.' },
    { status: 400 }
  )
}
