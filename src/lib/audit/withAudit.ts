import { NextResponse } from "next/server";
import { logAction, type LogActionInput } from "./logAction";

/**
 * Wraps a route handler so every successful mutation is logged without
 * every route having to repeat the same logAction() boilerplate.
 *
 * Usage:
 *   export const POST = withAudit(
 *     { action: "CREATE", entity: "Vendor" },
 *     async (req) => {
 *       const vendor = await Vendor.create(...);
 *       return NextResponse.json({ success: true, data: vendor });
 *     }
 *   );
 *
 * `describe` can be a static object or a function of (req, response body)
 * so entityId/before/after can be derived from what the handler returned.
 */
type Describe =
  | Partial<LogActionInput>
  | ((req: Request, responseBody: any) => Partial<LogActionInput>);

export function withAudit(
  describe: Describe,
  handler: (req: Request, ctx?: any) => Promise<Response>
) {
  return async function wrapped(req: Request, ctx?: any) {
    const startedAt = Date.now();
    const res = await handler(req, ctx);
    const durationMs = Date.now() - startedAt;

    // Only log on success — failed writes (4xx/5xx) aren't audit-worthy
    // "actions", and we don't want to log e.g. validation-rejected payloads
    // as if they happened.
    if (res.status >= 200 && res.status < 300) {
      let body: any = undefined;
      try {
        // Clone so we don't consume the body the caller is about to return.
        body = await res.clone().json();
      } catch {
        // non-JSON response — fine, just log without a body reference
      }

      const desc =
        typeof describe === "function" ? describe(req, body) : describe;

      await logAction({
        action: desc.action || req.method || "UNKNOWN",
        entity: desc.entity || "Unknown",
        entityId: desc.entityId ?? body?.data?._id ?? body?.data?.id,
        before: desc.before,
        after: desc.after ?? body?.data,
        metadata: desc.metadata,
        actor: desc.actor,
        req,
        durationMs,
        statusCode: res.status,
      });
    }

    return res;
  };
}
