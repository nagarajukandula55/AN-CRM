/**
 * =========================================================
 * AUTH — Custom JWT Implementation
 * =========================================================
 * NextAuth has been replaced by a custom JWT middleware.
 * The middleware (src/middleware.ts) verifies the `an_token`
 * cookie and injects headers:
 *   x-user-id, x-user-email, x-user-name,
 *   x-user-role, x-is-super-admin
 *
 * This `auth()` function reads those headers to build a
 * session-compatible object so existing code continues to work.
 * =========================================================
 */
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export interface ILegacySession {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isSuperAdmin: boolean;
  };
}

/**
 * Drop-in replacement for NextAuth's `auth()`.
 * Returns a session object built from JWT middleware headers,
 * or null if the request is unauthenticated.
 */
export async function auth(): Promise<ILegacySession | null> {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    const userEmail = h.get("x-user-email");

    if (!userId || !userEmail) return null;

    return {
      user: {
        id: userId,
        email: userEmail,
        name: h.get("x-user-name") || "",
        role: h.get("x-user-role") || "USER",
        isSuperAdmin: h.get("x-is-super-admin") === "true",
      },
    };
  } catch {
    return null;
  }
}

/**
 * Route handlers stub for /api/auth/[...nextauth]
 * (kept so that path continues to exist without errors)
 */
export const GET = async () =>
  NextResponse.json({ message: "Custom JWT auth active" });
export const POST = async () =>
  NextResponse.json({ message: "Custom JWT auth active" });

/** Legacy exports — unused but prevent import errors */
export const signIn = async () => null;
export const signOut = async () => null;
export const handlers = { GET, POST };
