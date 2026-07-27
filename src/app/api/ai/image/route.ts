import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, width = 1024, height = 1024, style } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const clampedWidth = Math.min(Math.max(width, 256), 2048);
    const clampedHeight = Math.min(Math.max(height, 256), 2048);

    const fullPrompt = style
      ? `${prompt.trim()}, ${style} style`
      : prompt.trim();

    const encodedPrompt = encodeURIComponent(fullPrompt);

    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${clampedWidth}&height=${clampedHeight}&model=flux&nologo=true&enhance=true`;

    const verifyResponse = await fetch(imageUrl, { method: 'HEAD' });
    if (!verifyResponse.ok) {
      return NextResponse.json(
        { error: 'Image generation service unavailable' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      imageUrl,
      prompt: fullPrompt,
      width: clampedWidth,
      height: clampedHeight,
    });
  } catch (error) {
    console.error('POST /api/ai/image error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
