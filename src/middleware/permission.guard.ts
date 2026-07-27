import { IAuthSession } from "@/lib/auth/session";

/**
 * CONVENTION MIGRATION — RESOLVED: every live requirePermission()/
 * requireAnyPermission() call site (11 total, across finance/audit/
 * logistics/inventory/purchase/organization/dashboard/analytics routes) has
 * been migrated to call core/access/actions.ts's buildPermissionCode()
 * instead of hand-typing lowercase-dot strings like "dashboard.view". That
 * function is the ONE place the "MODULEKEY.ACTIONKEY" naming convention is
 * defined, so every call site now derives its code from the same source the
 * module-registry/permission-sync system uses to generate grantable
 * permissions — no more drift between what a route checks for and what a
 * seeded module actually grants.
 *
 * hasPermission() below still normalizes case before comparing. This is now
 * pure defense-in-depth (tolerates any stray mixed-case permission code that
 * might exist in older stored session/role data) rather than a load-bearing
 * bridge between two live conventions — there is only one convention now.
 *
 * SUPER-ADMIN BYPASS — FIXED: every call site actually passes the real
 * IEnrichedSession (from getEnrichedSession(), which DOES resolve
 * isSuperAdmin from the x-is-super-admin header) into these functions via an
 * `as any` cast to satisfy this file's narrower IAuthSession type. But this
 * file never read isSuperAdmin at all, so a genuine super admin hit a flat
 * 403 on any route whose exact permission code hadn't been separately
 * granted to their role — GST, Finance, Audit, Analytics, Logistics,
 * Purchase, Inventory, and Business-creation routes all had this bug. Every
 * other access check in the app (filterModulesByPermission for the sidebar,
 * setRolePermissions, etc.) already bypasses for super admins; this was the
 * one place that didn't. Fixed by checking session.isSuperAdmin first —
 * super admin always has full access, unconditionally; every other role
 * still goes through the exact same permission-list check as before.
 */
function hasPermission(session: IAuthSession, permission: string): boolean {
  if (session.isSuperAdmin) return true;
  const wanted = permission.toUpperCase();
  return session.permissions.some((p: string) => p.toUpperCase() === wanted);
}

/**
 * Generic permission guard for API routes
 */
export function requirePermission(
  session: IAuthSession | null,
  permission: string
) {
  if (!session?.user) {
    const error = new Error("Unauthorized");
    (error as any).code = "UNAUTHORIZED";
    throw error;
  }

  if (!hasPermission(session, permission)) {
    const error = new Error(
      `Forbidden: Missing permission -> ${permission}`
    );
    (error as any).code = "FORBIDDEN";
    throw error;
  }
}

/**
 * Require any permission (OR logic)
 */
export function requireAnyPermission(
  session: IAuthSession | null,
  permissions: string[]
) {
  if (!session?.user) {
    const error = new Error("Unauthorized");
    (error as any).code = "UNAUTHORIZED";
    throw error;
  }

  if (session.isSuperAdmin) return;

  const ok = permissions.some((p) => hasPermission(session, p));

  if (!ok) {
    const error = new Error(
      `Forbidden: Requires one of -> ${permissions.join(
        ", "
      )}`
    );
    (error as any).code = "FORBIDDEN";
    throw error;
  }
}

/**
 * Require role (fallback check)
 */
export function requireRole(
  session: IAuthSession | null,
  role: string
) {
  if (!session?.user) {
    const error = new Error("Unauthorized");
    (error as any).code = "UNAUTHORIZED";
    throw error;
  }

  // Same super-admin bypass as requirePermission()/requireAnyPermission()
  // above — a super admin isn't expected to hold every specific role code
  // any more than every specific permission code.
  if (session.isSuperAdmin) return;

  if (!session.roles.includes(role)) {
    const error = new Error(
      `Forbidden: Missing role -> ${role}`
    );
    (error as any).code = "FORBIDDEN";
    throw error;
  }
}

/**
 * Safe wrapper for API routes
 */
export async function withPermission<T>(
  session: IAuthSession | null,
  permission: string,
  fn: () => Promise<T>
): Promise<T> {
  requirePermission(session, permission);
  return await fn();
}
