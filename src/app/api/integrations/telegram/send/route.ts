// Route: /api/integrations/telegram/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Integration from '@/models/Integration';
import { TelegramConfig } from '@/models/Integration';

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const businessId = req.headers.get('x-active-business-id');
  const body = await req.json();
  const { message, chatIds: chatIdsOverride } = body;

  await connectDB();

  const integration = await Integration.findOne({
    businessId,
    provider: 'TELEGRAM',
  }).lean();

  if (!integration || !integration.isActive) {
    return NextResponse.json(
      { error: 'Telegram not configured' },
      { status: 400 }
    );
  }

  const config = integration.config as TelegramConfig;

  if (!config?.botToken) {
    return NextResponse.json(
      { error: 'Telegram not configured' },
      { status: 400 }
    );
  }

  const targetChatIds: string[] =
    Array.isArray(chatIdsOverride) && chatIdsOverride.length > 0
      ? chatIdsOverride
      : config.chatIds ?? [];

  const results = await Promise.allSettled(
    targetChatIds.map((chatId) =>
      fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      })
    )
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;

  return NextResponse.json({
    success: true,
    summary: { success: sent, total: targetChatIds.length },
  });
}
