/**
 * Auth session helpers (custom JWT version)
 * Auth is now handled via custom JWT — see lib/auth/jwt.ts
 * This file is kept for reference; use getAuthUser() from jwt.ts instead.
 */
import User from "@/models/User";

/**
 * Full enriched session context for ERP
 */
export interface IAuthSession {
  user: {
    id: string;
    name: string;
    email: string;
  };

  organizationId?: string;
  businessId?: string;

  roles: string[];
  permissions: string[];

  // Every real call site (getEnrichedSession()'s IEnrichedSession) already
  // carries isSuperAdmin and was being passed into requirePermission()/
  // requireAnyPermission() via an `as any` cast — but permission.guard.ts
  // never read it, so a genuine super admin got a flat 403 on any route
  // whose exact permission code hadn't been separately granted (GST,
  // Finance, Audit, Analytics, Logistics, Purchase, Inventory, and
  // Business-creation routes all hit this). Declared here (optional, so
  // this doesn't become a required field for every other IAuthSession
  // caller) so permission.guard.ts can bypass correctly for super admins —
  // matching the same bypass core/access/filterModulesByPermission.ts
  // already applies to the sidebar.
  isSuperAdmin?: boolean;
}

/**
 * Legacy stub — session is now provided by custom JWT middleware
 * Use req.headers.get('x-user-id') in API routes instead
 */
export async function getSession() {
  return null;
}

export async function getAuthSession(): Promise<IAuthSession | null> {
  return null;
}

/**
 * Check if user has permission
 */
export function hasPermission(
  session: IAuthSession | null,
  permission: string
): boolean {
  if (!session) return false;

  return session.permissions.includes(permission);
}

/**
 * Check if user has role
 */
export function hasRole(
  session: IAuthSession | null,
  role: string
): boolean {
  if (!session) return false;

  return session.roles.includes(role);
}
