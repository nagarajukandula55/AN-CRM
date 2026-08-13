import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { buildAuthSession } from "@/lib/auth/buildAuthSession";
import { SUPER_ADMIN_ONLY_HOSTS } from "@/lib/auth/superAdminHosts";

export async function POST(req: Request) {
  try {
    await connectDB();

    const body = await req.json();
    const { email, username, password } = body ?? {};

    if ((!email && !username) || !password) {
      return NextResponse.json(
        { success: false, message: "Credentials required" },
        { status: 400 }
      );
    }

    /* ── Find user by email OR username ──────────────────────────────── */
    // password re-selected -- needed again for the local-fallback check
    // below (lazy migration for accounts not yet synced to central-api).
    const user = await User.findOne({
      $or: [
        ...(email    ? [{ email: email.toLowerCase().trim() }] : []),
        ...(username ? [{ username: username.toLowerCase().trim() }] : []),
      ],
    })
      .select("+password")
      .lean()
      .exec() as any;

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    // Was never checked here at all -- a deactivated account (isActive:
    // false, e.g. the zero-role accounts scripts/wipeToSuperAdminOnly.ts
    // and /api/admin/maintenance/wipe-roles deliberately deactivate) could
    // still authenticate successfully and get a valid session.
    if (user.isActive === false) {
      return NextResponse.json(
        { success: false, message: "This account has been deactivated. Contact your administrator." },
        { status: 403 }
      );
    }

    // Password verification is delegated to central-api's PlatformUser
    // store first -- this app's own `User` document (found above) remains
    // the SOLE source of truth for everything else below (memberships,
    // roles, homeRoute, isSuperAdmin, etc.); only "is this password
    // correct" moves off-app. This is also the wrong-site guard for free:
    // a person who only has an ANgroup or Native account has no `User`
    // document here at all, so they already 404'd above regardless of
    // whether central-api would accept their password.
    //
    // LAZY MIGRATION FALLBACK: a bcrypt hash can't be "moved" into
    // central-api without knowing the plaintext password, so any account
    // that predates this cutover has no matching central-api record yet
    // and would otherwise be locked out permanently, not just once. If
    // central-api rejects the login, fall back to this app's own local
    // bcrypt check -- and if THAT succeeds, sync the now-known-correct
    // password into central-api (POST /api/auth/sync) so this same
    // person's NEXT login goes through central-api directly. Fails
    // closed (503), not open, only when CENTRAL_API_URL itself is
    // unreachable/unconfigured -- a configured central-api that simply
    // doesn't recognize this account yet is exactly the expected,
    // handled case, not an outage.
    if (!process.env.CENTRAL_API_URL) {
      console.error("[login] CENTRAL_API_URL is not configured -- cannot authenticate.");
      return NextResponse.json(
        { success: false, message: "Login is temporarily unavailable. Please try again shortly." },
        { status: 503 }
      );
    }

    let valid = false;
    let centralApiReachable = true;
    // businessAccess from central-api's own login response -- used below
    // (once activeBusinessId is known) to find this person's role name
    // for that specific business, so the sidebar can look up its
    // allowedPages. Not used for authorization here -- only for that
    // lookup key.
    let centralBusinessAccess: { businessId: string; role: string }[] = [];
    try {
      const centralRes = await fetch(`${process.env.CENTRAL_API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      });
      valid = centralRes.ok;
      if (valid) {
        const centralBody = await centralRes.json().catch(() => null);
        centralBusinessAccess = centralBody?.user?.businessAccess || [];
      }
    } catch (err) {
      console.error("[login] central-api auth check failed:", (err as any)?.message || err);
      centralApiReachable = false;
    }

    if (!valid && centralApiReachable && user.password) {
      const localValid = await bcrypt.compare(password, user.password);
      if (localValid) {
        valid = true;
        fetch(`${process.env.CENTRAL_API_URL}/api/auth/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.CENTRAL_API_KEY || "" },
          body: JSON.stringify({ email: user.email, password, name: user.name }),
        }).catch((err) => console.error("[login] central-api sync failed:", err?.message || err));
      }
    }

    if (!valid) {
      if (!centralApiReachable) {
        return NextResponse.json(
          { success: false, message: "Login is temporarily unavailable. Please try again shortly." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { success: false, message: "Invalid password" },
        { status: 401 }
      );
    }

    // Several signup paths deliberately create the account with
    // isActive:false — a vendor pending admin approval
    // (register/vendor/route.ts), or an employee pending HR activation —
    // but this check never existed, so a valid password alone was enough
    // to log in and receive a full session token regardless of pending
    // status. Must be checked here, not just left to "isActive" filters on
    // individual downstream routes, since the token itself grants access.
    if (user.isActive === false) {
      return NextResponse.json(
        { success: false, message: "Your account is not active yet. Please wait for approval or contact support." },
        { status: 403 }
      );
    }

    // crmadmin.angroup.in is the dedicated super-admin login/usage domain
    // (see middleware.ts's matching enforcement, which is the authoritative
    // check -- this is just a clean, immediate rejection at login instead
    // of a confusing "logged in then bounced" experience for anyone who
    // isn't super admin trying to sign in there).
    const host = req.headers.get("host") || "";
    if (SUPER_ADMIN_ONLY_HOSTS.has(host) && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, message: "This login is reserved for platform administrators." },
        { status: 403 }
      );
    }

    const { token, safeUser } = await buildAuthSession(user, centralBusinessAccess);

    /* ── Set httpOnly cookie + return token in JSON ──────────────────── */
    const res = NextResponse.json({ success: true, token, user: safeUser });

    res.cookies.set("an_token", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 7, // 7 days
      path:     "/",
    });

    return res;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
