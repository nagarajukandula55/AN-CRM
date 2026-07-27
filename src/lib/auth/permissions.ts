import { IAuthSession } from "./session";

/**
 * Check if user has a specific permission
 */
export function can(
  session: IAuthSession | null,
  permission: string
): boolean {
  if (!session) return false;

  return session.permissions.includes(permission);
}

/**
 * Check if user does NOT have a permission
 */
export function cannot(
  session: IAuthSession | null,
  permission: string
): boolean {
  return !can(session, permission);
}

/**
 * Require permission (throw-based guard for services/APIs)
 */
export function requirePermission(
  session: IAuthSession | null,
  permission: string
): void {
  if (!can(session, permission)) {
    const error = new Error(
      `Forbidden: Missing permission -> ${permission}`
    );
    (error as any).code = "FORBIDDEN";
    throw error;
  }
}

/**
 * Check multiple permissions (ANY match)
 */
export function canAny(
  session: IAuthSession | null,
  permissions: string[]
): boolean {
  if (!session) return false;

  return permissions.some((p) =>
    session.permissions.includes(p)
  );
}

/**
 * Check multiple permissions (ALL required)
 */
export function canAll(
  session: IAuthSession | null,
  permissions: string[]
): boolean {
  if (!session) return false;

  return permissions.every((p) =>
    session.permissions.includes(p)
  );
}

/**
 * Role-based helper (fallback layer)
 */
export function hasRole(
  session: IAuthSession | null,
  role: string
): boolean {
  if (!session) return false;

  return session.roles.includes(role);
}

/**
 * Require role (strict guard)
 */
export function requireRole(
  session: IAuthSession | null,
  role: string
): void {
  if (!hasRole(session, role)) {
    const error = new Error(
      `Forbidden: Missing role -> ${role}`
    );
    (error as any).code = "FORBIDDEN";
    throw error;
  }
}
