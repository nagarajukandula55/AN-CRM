import jwt from "jsonwebtoken";

// Was a module-level throw -- crashed the ENTIRE production build, not just
// requests that actually need these secrets. Next.js's build step ("collect
// page data") imports every route module to statically analyze it, even
// ones never invoked during build, so a missing env var at BUILD time (as
// opposed to runtime, where Vercel env vars are actually available) took
// down every single route in one throw. Same bug class already fixed for
// MongoDB (lib/mongodb.ts) and Razorpay (services/order.service.ts) this
// session -- resolved lazily instead, only throwing when a token is
// actually signed/verified.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable is required and must not use the insecure default. Set it before starting the app."
    );
  }
  return secret;
}

export interface JWTPayload {
  id: string;
  email: string;
  username?: string;
  name: string;
  role: string;
  isSuperAdmin: boolean;
  isPlatformStaff?: boolean;
  businessIds: string[];
  activeBusinessId?: string;
  /** VendorProfile._id currently being viewed -- lets a parent vendor
   * Owner switch into one of their own sub-vendors (VendorProfile.
   * parentVendorId) without a separate Business (sub-vendors share their
   * parent's businessId, so activeBusinessId alone can't express this).
   * See api/auth/switch-vendor/route.ts. Absent/undefined means "my own
   * vendor", resolved the normal way via resolveVendorContext -- this
   * claim is only ever an override, never trusted as sole authorization
   * (resolveAuthorizedVendorScope re-validates parentVendorId server-side
   * on every request, never just believes the claim). */
  activeVendorId?: string;
  organizationId?: string;
  mustChangePassword?: boolean;
  /** This user's role name (free text, admin-defined -- see central-api's
   * role catalog / this app's own Roles & Access business-settings panel)
   * for the CURRENT activeBusinessId, as returned in central-api's own
   * /api/auth/login response body. Used only to look up that role's
   * allowedPages when filtering the sidebar (api/ui/sidebar/route.ts) --
   * this is a SEPARATE, coarser concept from this app's own local Role/
   * Permission system (`role` above, `permissions` resolved via
   * getEnrichedSession()), which remains the actual authorization source
   * of truth for API access. Null/absent means "no central role recorded
   * for this business" -- sidebar filtering treats that as unrestricted,
   * same as an untagged business or an empty allowedPages list. */
  centralRole?: string | null;
  /** User.sessionVersion at the time this token was issued -- bumped on
   * every login so an older, still-unexpired token from a previous device
   * fails the sessionVersion check in getEnrichedSession (single active
   * session enforcement). See api/auth/login/route.ts. */
  sessionVersion?: number;
  iat?: number;
  exp?: number;
}

/**
 * Sign a standard auth JWT (7 days)
 */
export function signToken(payload: Omit<JWTPayload, "iat" | "exp">): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

/**
 * Verify and decode a standard auth JWT
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Extract token from request (Authorization header or cookie)
 */
export function extractToken(request: Request): string | null {
  // Try Authorization header first
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Try cookie
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split("; ").map((c) => {
        const [k, ...v] = c.split("=");
        return [k, v.join("=")];
      })
    );
    return cookies["an_token"] || null;
  }

  return null;
}

/**
 * Get authenticated user from request
 */
export function getAuthUser(request: Request): JWTPayload | null {
  const token = extractToken(request);
  if (!token) return null;
  return verifyToken(token);
}
