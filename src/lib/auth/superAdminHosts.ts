/**
 * Hostnames reserved for platform administrators only. A super admin can
 * still use the regular domain too (this doesn't take anything away from
 * them there) -- this only gates the DEDICATED admin domain so that a
 * vendor account can never authenticate on it, giving super admin their
 * own URL without a second codebase/deployment (see middleware.ts's
 * enforcement and api/auth/login's matching pre-check).
 *
 * Shared between the Edge middleware and Node API routes, so it's a plain
 * constant with no runtime-specific imports.
 */
export const SUPER_ADMIN_ONLY_HOSTS = new Set<string>([
  "crmadmin.angroup.in",
]);
