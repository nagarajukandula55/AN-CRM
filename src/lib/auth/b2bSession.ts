import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

/**
 * Session for the B2B partner ordering portal (/b2b/[vendorId]) — a
 * CreditAccount logging in, not a platform User, so this is deliberately
 * separate from lib/auth/jwt.ts's JWTPayload (which assumes role/
 * isSuperAdmin/businessIds shaped for the main app). Reuses the same
 * JWT_SECRET + jsonwebtoken package, different cookie name and payload.
 */
export interface B2BSessionPayload {
  accountId: string;
  vendorId: string;
  businessId: string;
  type: "DISTRIBUTOR" | "RETAILER";
  name: string;
}

const COOKIE_NAME = "b2b_token";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required.");
  return secret;
}

export function signB2BToken(payload: B2BSessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "30d" });
}

export function verifyB2BToken(token: string): B2BSessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as B2BSessionPayload;
  } catch {
    return null;
  }
}

/** Reads and verifies the B2B session cookie from a server component/route. */
export async function getB2BSession(): Promise<B2BSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyB2BToken(token);
}

export { COOKIE_NAME as B2B_COOKIE_NAME };
