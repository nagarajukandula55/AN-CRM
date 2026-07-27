import { headers } from "next/headers";
import AuditLog from "@/models/AuditLog";
import { connectDB } from "@/lib/mongodb";
import type { JWTPayload } from "@/lib/auth/jwt";

/**
 * Shared audit-logging helper.
 *
 * Every mutating API route in the app should call logAction() (directly, or
 * via withAudit() below) right after a write succeeds. This is the single
 * place that decides what an audit entry looks like, so entity naming and
 * actor identity stay consistent no matter which route writes it.
 *
 * Failure to write an audit log must NEVER break the calling request — this
 * always swallows its own errors after a best-effort console.error, since a
 * logging bug should not be able to take down real functionality.
 */

export interface LogActionInput {
  /** Short verb describing what happened, e.g. "CREATE", "UPDATE", "DELETE",
   *  "APPROVE", "REJECT", "SWITCH_BUSINESS", "EXIT_BUSINESS", "LOGIN". */
  action: string;
  /** What kind of thing this happened to, e.g. "Vendor", "Product", "Business". */
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  /** Pass the request when available so IP/UA/path can be captured. */
  req?: Request;
  /** Handler wall-clock time in ms, when the caller measured a span
   *  (see withAudit()). Omit if there's nothing meaningful to time. */
  durationMs?: number;
  /** HTTP status code the wrapped handler returned (see withAudit()). */
  statusCode?: number;
  /** Override actor identity — needed in routes (like switch-business) that
   *  read the JWT directly instead of going through getEnrichedSession().
   *  Fields accept `null` as well as `undefined` since the common source —
   *  `req.headers.get(...)` — returns `string | null`, not `string | undefined`. */
  actor?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
    isSuperAdmin?: boolean | null;
    businessId?: string | null;
    organizationId?: string | null;
  };
}

function getClientIp(req?: Request): string | undefined {
  if (!req) return undefined;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || undefined;
}

/**
 * Best-effort actor lookup from middleware-injected headers, for call sites
 * that don't have an explicit `actor` and aren't running inside a request
 * object they can inspect directly (e.g. Server Components / route handlers
 * that already ran getEnrichedSession() upstream but didn't pass it in).
 */
async function actorFromHeaders(): Promise<NonNullable<LogActionInput["actor"]>> {
  try {
    const h = await headers();
    return {
      id: h.get("x-user-id") || undefined,
      email: h.get("x-user-email") || undefined,
      name: h.get("x-user-name") || undefined,
      isSuperAdmin: h.get("x-is-super-admin") === "true",
      businessId: h.get("x-active-business-id") || undefined,
      organizationId: h.get("x-organization-id") || undefined,
    };
  } catch {
    return {};
  }
}

export async function logAction(input: LogActionInput): Promise<void> {
  try {
    await connectDB();

    const actor = input.actor || (await actorFromHeaders());

    await AuditLog.create({
      businessId: actor.businessId || undefined,
      organizationId: actor.organizationId || undefined,
      userId: actor.id || undefined,
      userEmail: actor.email || undefined,
      userName: actor.name || undefined,
      isSuperAdmin: !!actor.isSuperAdmin,

      action: input.action,
      entity: input.entity,
      entityType: input.entity,
      entityId: input.entityId ?? null,

      before: input.before,
      after: input.after,
      metadata: input.metadata,

      by: actor.email || actor.id || "system",

      method: input.req?.method,
      path: input.req ? new URL(input.req.url).pathname : undefined,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      ip: getClientIp(input.req),
      userAgent: input.req?.headers.get("user-agent") || undefined,
    });
  } catch (err) {
    // Logging must never break the caller's actual operation.
    console.error("[audit] failed to write audit log:", err);
  }
}

/**
 * Convenience helper for routes that already have a decoded JWT payload
 * (e.g. switch-business / exit-business, which read an_token directly
 * instead of relying on middleware-injected headers).
 */
export function actorFromPayload(payload: JWTPayload) {
  return {
    id: payload.id,
    email: payload.email,
    name: payload.name,
    isSuperAdmin: payload.isSuperAdmin,
    businessId: payload.activeBusinessId,
    organizationId: payload.organizationId,
  };
}
