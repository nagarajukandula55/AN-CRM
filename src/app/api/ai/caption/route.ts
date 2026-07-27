import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { context, platform, tone = 'professional' } = body;

    if (!context || typeof context !== 'string' || context.trim().length === 0) {
      return NextResponse.json({ error: 'context is required' }, { status: 400 });
    }

    if (!platform || typeof platform !== 'string') {
      return NextResponse.json({ error: 'platform is required' }, { status: 400 });
    }

    const platformGuidelines: Record<string, string> = {
      INSTAGRAM:
        'Instagram (max 2200 chars, use line breaks, include 5-10 relevant hashtags at the end)',
      LINKEDIN:
        'LinkedIn (professional tone, max 3000 chars, 3-5 relevant hashtags, encourage engagement)',
      TWITTER:
        'Twitter/X (max 280 chars including hashtags, punchy and concise, 1-2 hashtags)',
      FACEBOOK:
        'Facebook (conversational, max 500 chars recommended, 2-3 hashtags optional)',
      ALL: 'social media (engaging, versatile caption that works across platforms, 3-5 hashtags)',
    };

    const platformGuide =
      platformGuidelines[platform.toUpperCase()] ||
      `${platform} social media platform`;

    const userPrompt = `Generate an engaging ${platformGuide} caption for the following content:

Content/Context: ${context.trim()}

Tone: ${tone}

Requirements:
- Write a compelling caption that drives engagement
- Include a clear call-to-action where appropriate
- Add relevant hashtags as specified for the platform
- Make it authentic and brand-appropriate
- Return ONLY the caption text with hashtags, no explanations or meta-commentary

Caption:`;

    const pollinationsResponse = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content:
              'You are an expert social media copywriter who creates engaging, platform-optimized captions that drive engagement and conversions. Return only the caption text, nothing else.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        model: 'openai',
        stream: false,
      }),
    });

    if (!pollinationsResponse.ok) {
      return NextResponse.json(
        { error: 'Caption generation service unavailable' },
        { status: 502 }
      );
    }

    const responseText = await pollinationsResponse.text();

    let caption = responseText.trim();

    caption = caption
      .replace(/^["']|["']$/g, '')
      .replace(/^Caption:\s*/i, '')
      .trim();

    if (!caption) {
      return NextResponse.json({ error: 'Failed to generate caption' }, { status: 500 });
    }

    return NextResponse.json({ caption, platform, tone });
  } catch (error) {
    console.error('POST /api/ai/caption error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
