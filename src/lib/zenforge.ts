import { connectDB } from '@/lib/mongodb';
import Integration, { ZenforgeConfig } from '@/models/Integration';

/**
 * Server-side helper for talking to a business's connected Zenforge instance.
 * The API secret never reaches the browser: every /admin/zenforge page action
 * hits an ANgroup API route (src/app/api/admin/zenforge/*), which calls this
 * to look up the stored baseUrl/apiSecret and forwards the request itself.
 */
export async function getZenforgeConfig(businessId: string): Promise<ZenforgeConfig | null> {
  await connectDB();
  const integration = await Integration.findOne({ businessId, provider: 'ZENFORGE' }).lean();
  const config = integration?.config as ZenforgeConfig | undefined;
  if (!config?.baseUrl) return null;
  return config;
}

export interface ZenforgeFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/**
 * Calls a Zenforge API path with the stored secret attached. `protectedRoute`
 * controls whether the Authorization header is sent — Zenforge's write
 * endpoints (approve, manual, channels/upsert, pipeline/trigger) require it;
 * its read-only status endpoints don't care either way, so it's harmless to
 * always send it, but the flag makes intent explicit at each call site.
 */
export async function zenforgeFetch<T = unknown>(
  config: ZenforgeConfig,
  path: string,
  options: { method?: string; body?: unknown; protectedRoute?: boolean } = {}
): Promise<ZenforgeFetchResult<T>> {
  const { method = 'GET', body, protectedRoute = false } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (protectedRoute) {
    headers.Authorization = `Bearer ${config.apiSecret}`;
  }

  const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}
