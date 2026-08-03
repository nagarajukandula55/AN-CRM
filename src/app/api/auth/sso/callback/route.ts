import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Business from "@/models/Business";
import BusinessMember, { BusinessMemberStatus } from "@/models/BusinessMember";
import { buildAuthSession } from "@/lib/auth/buildAuthSession";
import crypto from "crypto";
import bcryptjs from "bcryptjs";
import { generateUniqueUserId } from "@/lib/auth/generateUserId";

/**
 * GET /api/auth/sso/callback?ssoToken=...
 *
 * Server-side leg of central-api's SSO handoff (see central-api's
 * routes/platformAuth.js top comment for the full three-step flow). The
 * browser arrives here holding a short-lived, single-use ssoToken minted
 * by central-api's own hosted login portal (public/portal/index.html,
 * extended to redirect here after login when a redirectUri param is
 * present). This route:
 *   1. Redeems the token server-to-server against central-api's
 *      /sso/verify (requires our own x-api-key — only a registered site
 *      can redeem tokens, so a leaked token is useless to anyone else).
 *   2. Checks the returned businessAccess against LOCAL Business records
 *      (via sourceId, same join every other central-api read in this app
 *      already uses) — this is the "wrong site" guard central-api's own
 *      comment says is each consuming site's OWN responsibility, since
 *      only this app knows which businesses it actually operates.
 *   3. On a match, gets-or-creates a local User + BusinessMember and
 *      issues an identical an_token session to a normal password login
 *      (via buildAuthSession, shared with api/auth/login/route.ts).
 *   4. On no match, sends the browser back to central-api's own portal
 *      rather than granting a session on the wrong site.
 *
 * Scope note: this path is for AN Group staff/business-admin logins
 * (the same audience as central-api's portal) landing on /console --
 * vendors keep their existing AN-CRM-only email+password login, they were
 * never issued central-api PlatformUser accounts by this design.
 */
export async function GET(req: NextRequest) {
  const loginUrl = new URL("/login", req.url);

  try {
    await connectDB();

    const ssoToken = req.nextUrl.searchParams.get("ssoToken") || req.nextUrl.searchParams.get("token");
    if (!ssoToken) {
      loginUrl.searchParams.set("error", "sso_missing_token");
      return NextResponse.redirect(loginUrl);
    }

    if (!process.env.CENTRAL_API_URL) {
      loginUrl.searchParams.set("error", "sso_unavailable");
      return NextResponse.redirect(loginUrl);
    }

    let verifyBody: any = null;
    try {
      const verifyRes = await fetch(`${process.env.CENTRAL_API_URL}/api/auth/sso/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.CENTRAL_API_KEY || "" },
        body: JSON.stringify({ ssoToken }),
      });
      if (!verifyRes.ok) {
        loginUrl.searchParams.set("error", "sso_failed");
        return NextResponse.redirect(loginUrl);
      }
      verifyBody = await verifyRes.json();
    } catch (err) {
      console.error("[sso/callback] central-api /sso/verify unreachable:", (err as any)?.message || err);
      loginUrl.searchParams.set("error", "sso_failed");
      return NextResponse.redirect(loginUrl);
    }

    const centralUser: { id: string; email: string; name?: string; businessAccess?: { businessId: string; role: string }[] } =
      verifyBody?.user;
    if (!centralUser?.email) {
      loginUrl.searchParams.set("error", "sso_failed");
      return NextResponse.redirect(loginUrl);
    }

    const centralBusinessAccess = centralUser.businessAccess || [];

    // Wrong-site guard: resolve each central businessId to a LOCAL
    // Business via sourceId (central's "businesses" dataset row for a
    // given local business stores sourceId = that local Business._id --
    // same reverse-join api/auth/login/route.ts's centralRole lookup and
    // lib/auth/resolveCentralRole.ts already rely on).
    let matchedBusinessId: string | null = null;
    let matchedRole: string | null = null;
    for (const access of centralBusinessAccess) {
      try {
        const bizRes = await fetch(`${process.env.CENTRAL_API_URL}/api/v1/businesses/${access.businessId}`, {
          headers: { "x-api-key": process.env.CENTRAL_API_KEY || "" },
        });
        if (!bizRes.ok) continue;
        const bizBody = await bizRes.json().catch(() => null);
        const sourceId = bizBody?.sourceId;
        if (!sourceId) continue;
        const localBusiness = await Business.findById(sourceId).select("_id isActive").lean<any>();
        if (localBusiness && localBusiness.isActive !== false) {
          matchedBusinessId = String(localBusiness._id);
          matchedRole = access.role;
          break;
        }
      } catch (err) {
        console.error("[sso/callback] business resolution failed for", access.businessId, (err as any)?.message || err);
      }
    }

    if (!matchedBusinessId) {
      // Valid AN Group credentials, but for no business this site
      // operates -- never grant a session here; send them back to
      // central-api's own portal instead of a wrong-site AN-CRM session.
      const wrongSiteUrl = process.env.SSO_WRONG_SITE_URL || `${process.env.CENTRAL_API_URL}/portal/`;
      return NextResponse.redirect(wrongSiteUrl);
    }

    // Get-or-create the local User tied to this email.
    let user = await User.findOne({ email: centralUser.email.toLowerCase().trim(), isDeleted: { $ne: true } });
    if (!user) {
      // No local password needed -- this account only ever authenticates
      // via central-api SSO -- but User.password isn't nullable in
      // practice elsewhere in the app (password reset, local-fallback
      // login), so a random unusable hash keeps every other code path
      // that assumes a password exists working unchanged.
      const randomPassword = crypto.randomBytes(24).toString("hex");
      const hashed = await bcryptjs.hash(randomPassword, 12);
      user = await User.create({
        name: centralUser.name || centralUser.email.split("@")[0],
        email: centralUser.email.toLowerCase().trim(),
        username: await generateUniqueUserId(),
        password: hashed,
        role: "USER",
        isActive: true,
        isEmailVerified: true,
        authProvider: "sso",
        defaultBusinessId: matchedBusinessId,
      });
    } else if (!user.isActive) {
      user.isActive = true;
      await user.save();
    }

    await BusinessMember.updateOne(
      { userId: user._id, businessId: matchedBusinessId },
      {
        $set: { status: BusinessMemberStatus.ACTIVE, isDeleted: false },
        $setOnInsert: {
          isDefaultBusiness: true,
          joinedAt: new Date(),
          memberType: matchedRole === "owner" || matchedRole === "admin" ? "ADMIN" : "STAFF",
        },
      },
      { upsert: true }
    );

    const { token, safeUser } = await buildAuthSession(user, centralBusinessAccess);

    const landing = (safeUser as any).homeRoute || "/console";
    const res = NextResponse.redirect(new URL(landing, req.url));

    res.cookies.set("an_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return res;
  } catch (error: unknown) {
    console.error("[sso/callback] unexpected error:", error);
    loginUrl.searchParams.set("error", "sso_failed");
    return NextResponse.redirect(loginUrl);
  }
}
