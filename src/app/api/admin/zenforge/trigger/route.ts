import { NextRequest, NextResponse } from 'next/server';
import { getZenforgeConfig, zenforgeFetch } from '@/lib/zenforge';
import { logAction } from '@/lib/audit/logAction';

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const businessId = req.headers.get('x-active-business-id');
  if (!businessId) return NextResponse.json({ error: 'x-active-business-id header is required' }, { status: 400 });

  const config = await getZenforgeConfig(businessId);
  if (!config) return NextResponse.json({ error: 'Zenforge is not connected for this business' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const result = await zenforgeFetch(config, '/api/pipeline/trigger', {
    method: 'POST',
    protectedRoute: true,
    body: { language: body.language },
  });

  logAction({ action: 'RUN', entity: 'ZenforgePipeline', entityId: body.language || 'all', after: result.data, req });

  return NextResponse.json(result.data, { status: result.status });
}
