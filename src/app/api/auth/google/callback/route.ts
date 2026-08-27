/**
 * GET /api/auth/google/callback — Google redirects here with `code`+`state`
 * after the user approves consent. Exchanges the code for Google's user
 * info, matches it against an EXISTING active User by email, and issues
 * the exact same session buildAuthSession gives a password or phone-OTP
 * login -- see api/auth/otp/verify/route.ts's identical pattern.
 *
 * LOGIN only, not signup: a Google account with no matching User here is
 * rejected with a clear message rather than silently creating a new
 * account -- auto-creating raises real questions (which role? which plan?
 * does it start a trial?) that are a separate decision, not something to
 * default silently just because someone clicked "Sign in with Google."
 * Someone new should go through /partner-signup first, same as today.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { buildAuthSession } from "@/lib/auth/buildAuthSession";
import { resolveLandingPath } from "@/core/access/vendorAccess.service";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const stateCookie = req.cookies.get("google_oauth_state")?.value;

  if (!code || !state || !stateCookie || state !== stateCookie) {
    return NextResponse.redirect(`${baseUrl}/login?error=google_invalid_state`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/login?error=google_not_configured`);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${baseUrl}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return NextResponse.redirect(`${baseUrl}/login?error=google_token_exchange_failed`);
    }

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    const email: string | undefined = profile?.email;
    if (!profileRes.ok || !email || profile.email_verified === false) {
      return NextResponse.redirect(`${baseUrl}/login?error=google_profile_failed`);
    }

    await connectDB();
    const user = await User.findOne({ email: email.toLowerCase().trim(), isDeleted: { $ne: true } }).lean() as any;
    if (!user) {
      return NextResponse.redirect(`${baseUrl}/login?error=google_no_account`);
    }
    if (user.isActive === false) {
      return NextResponse.redirect(`${baseUrl}/login?error=account_deactivated`);
    }

    const { token, safeUser } = await buildAuthSession(user, []);
    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const landingPath = await resolveLandingPath(String(user._id), isSuperAdmin).catch(() => "/console");

    const res = NextResponse.redirect(
      (safeUser as any)?.mustChangePassword ? `${baseUrl}/update-password` : `${baseUrl}${landingPath}`
    );
    res.cookies.set("an_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    res.cookies.delete("google_oauth_state");
    return res;
  } catch (err) {
    console.error("[google oauth callback]", (err as any)?.message || err);
    return NextResponse.redirect(`${baseUrl}/login?error=google_login_failed`);
  }
}
