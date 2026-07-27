import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import AIConfig from '@/models/AIConfig'

const SYSTEM_PROMPT =
  'You are a social media expert who writes highly engaging, platform-optimized captions. ' +
  'Your captions are concise, creative, and include relevant hashtags. ' +
  'You always return your response as a valid JSON array of strings and nothing else.'

function buildUserPrompt(
  count: number,
  tone: string,
  platform: string,
  topic: string
): string {
  return (
    `Generate ${count} ${tone.toLowerCase()} captions for ${platform} about: ${topic}. ` +
    `Each caption should be platform-optimized with relevant hashtags. ` +
    `Return as a JSON array: ["caption1", "caption2", ...]`
  )
}

function parseCaptionfromText(text: string): string[] {
  // Try to extract JSON array from the response text
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      // fall through
    }
  }
  // Fallback: split by newlines and clean up
  return text
    .split('\n')
    .map((line) => line.replace(/^[\d]+[.)]\s*/, '').trim())
    .filter(Boolean)
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = req.headers.get('x-active-business-id')

  let body: {
    topic?: string
    tone?: string
    platform?: string
    count?: number
    provider?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    topic,
    tone = 'Professional',
    platform = 'Instagram',
    count = 3,
    provider: requestedProvider,
  } = body

  if (!topic) {
    return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
  }

  await connectDB()

  const config = businessId
    ? await AIConfig.findOne({ businessId }).lean()
    : null

  const provider = requestedProvider || config?.defaultTextProvider || 'openai'
  const userPrompt = buildUserPrompt(count, tone, platform, topic)

  // OpenAI
  if (provider === 'openai') {
    const openaiConfig = config?.providers?.openai
    if (!openaiConfig?.isEnabled || !openaiConfig?.apiKey) {
      return NextResponse.json(
        { error: 'No text generation provider configured. Please add an API key in AI Studio Settings.' },
        { status: 400 }
      )
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: openaiConfig.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.8,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message =
          (errorData as { error?: { message?: string } })?.error?.message ||
          `OpenAI API error: ${response.status} ${response.statusText}`
        return NextResponse.json({ error: message }, { status: response.status })
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const text = data?.choices?.[0]?.message?.content || ''
      const captions = parseCaptionfromText(text)
      return NextResponse.json({ captions })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate captions with OpenAI'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Anthropic
  if (provider === 'anthropic') {
    const anthropicConfig = config?.providers?.anthropic
    if (!anthropicConfig?.isEnabled || !anthropicConfig?.apiKey) {
      return NextResponse.json(
        { error: 'No text generation provider configured. Please add an API key in AI Studio Settings.' },
        { status: 400 }
      )
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicConfig.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: anthropicConfig.model || 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message =
          (errorData as { error?: { message?: string } })?.error?.message ||
          `Anthropic API error: ${response.status} ${response.statusText}`
        return NextResponse.json({ error: message }, { status: response.status })
      }

      const data = (await response.json()) as {
        content?: { type: string; text?: string }[]
      }
      const text = data?.content?.find((c) => c.type === 'text')?.text || ''
      const captions = parseCaptionfromText(text)
      return NextResponse.json({ captions })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate captions with Anthropic'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Google Gemini
  if (provider === 'google') {
    const googleConfig = config?.providers?.google
    if (!googleConfig?.isEnabled || !googleConfig?.apiKey) {
      return NextResponse.json(
        { error: 'No text generation provider configured. Please add an API key in AI Studio Settings.' },
        { status: 400 }
      )
    }

    try {
      const model = googleConfig.model || 'gemini-1.5-pro'
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }],
              },
            ],
            generationConfig: { temperature: 0.8 },
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message =
          (errorData as { error?: { message?: string } })?.error?.message ||
          `Google API error: ${response.status} ${response.statusText}`
        return NextResponse.json({ error: message }, { status: response.status })
      }

      const data = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const captions = parseCaptionfromText(text)
      return NextResponse.json({ captions })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate captions with Google Gemini'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // OpenRouter
  if (provider === 'openrouter') {
    const openrouterConfig = config?.providers?.openrouter
    if (!openrouterConfig?.isEnabled || !openrouterConfig?.apiKey) {
      return NextResponse.json(
        { error: 'No text generation provider configured. Please add an API key in AI Studio Settings.' },
        { status: 400 }
      )
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openrouterConfig.apiKey}`,
          'HTTP-Referer': 'https://your-app.com',
        },
        body: JSON.stringify({
          model: openrouterConfig.model || 'openai/gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.8,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message =
          (errorData as { error?: { message?: string } })?.error?.message ||
          `OpenRouter API error: ${response.status} ${response.statusText}`
        return NextResponse.json({ error: message }, { status: response.status })
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const text = data?.choices?.[0]?.message?.content || ''
      const captions = parseCaptionfromText(text)
      return NextResponse.json({ captions })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate captions with OpenRouter'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return NextResponse.json(
    { error: 'No text generation provider configured. Please add an API key in AI Studio Settings.' },
    { status: 400 }
  )
}
