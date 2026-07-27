// Route: /api/integrations/whatsapp/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Integration from '@/models/Integration';
import { WhatsAppConfig } from '@/models/Integration';

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const businessId = req.headers.get('x-active-business-id');
  const body = await req.json();
  const { message, recipients: recipientsOverride } = body;

  await connectDB();

  const integration = await Integration.findOne({
    businessId,
    provider: 'WHATSAPP',
  }).lean();

  if (!integration || !integration.isActive) {
    return NextResponse.json(
      { error: 'WhatsApp not configured' },
      { status: 400 }
    );
  }

  const config = integration.config as WhatsAppConfig;

  if (!config?.accessToken || !config?.phoneNumberId) {
    return NextResponse.json(
      { error: 'WhatsApp not configured' },
      { status: 400 }
    );
  }

  const targetRecipients: string[] =
    Array.isArray(recipientsOverride) && recipientsOverride.length > 0
      ? recipientsOverride
      : config.recipients ?? [];

  const results = await Promise.allSettled(
    targetRecipients.map((to) =>
      fetch(`https://graph.facebook.com/v19.0/${config.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
      }).then((res) => {
        if (!res.ok) throw new Error('WhatsApp API error');
        return res;
      })
    )
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;

  return NextResponse.json({
    success: true,
    summary: { success: sent, total: targetRecipients.length },
  });
}
