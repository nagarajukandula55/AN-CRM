/**
 * GET /api/auth/google/start — kicks off "Sign in with Google": redirects
 * to Google's OAuth consent screen. A random `state` value is minted and
 * stored in a short-lived httpOnly cookie, then echoed back by Google and
 * checked in the callback (CSRF protection -- without this, an attacker
 * could trick a victim's browser into completing an OAuth flow the
 * attacker initiated, binding the victim's session to the attacker's
 * Google account).
 *
 * This is LOGIN only, not signup -- api/auth/google/callback rejects any
 * Google account whose email doesn't already match an existing, active
 * User here. Creating a brand-new account via Google is a separate,
 * larger decision (which role/plan would it get?) not in scope for this
 * pass -- see that route's own comment.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  if (!clientId) {
    return NextResponse.redirect(`${baseUrl}/login?error=google_not_configured`);
  }

  const state = crypto.randomBytes(24).toString("hex");
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60, // 10 minutes -- just long enough to complete the redirect round trip
    path: "/",
  });
  return res;
}
