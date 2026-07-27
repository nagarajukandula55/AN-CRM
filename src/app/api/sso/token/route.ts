/**
 * SSO Token Generation Endpoint
 *
 * Used by: AN Group website, ShopNative, mobile apps, future products
 *
 * Flow:
 *   1. User authenticates on AN Group main portal
 *   2. Client requests SSO token with their session JWT
 *   3. This endpoint returns a short-lived SSO token (1h)
 *   4. Client passes SSO token to other apps
 *   5. Other apps verify at /api/sso/verify
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import BusinessMember from "@/models/BusinessMember";
import { signSSOToken, verifyToken, extractToken } from "@/lib/auth/jwt";

export async function POST(req: Request) {
  try {
    // Must have a valid AN Group session token
    const sessionToken = extractToken(req);
    if (!sessionToken) {
      return NextResponse.json(
        { success: false, message: "Session token required" },
        { status: 401 }
      );
    }

    const decoded = verifyToken(sessionToken);
    if (!decoded) {
      return NextResponse.json(
        { success: false, message: "Invalid session" },
        { status: 401 }
      );
    }

    await connectDB();

    const user = await User.findById(decoded.id).lean().exec() as any;
    if (!user || !user.isActive) {
      return NextResponse.json(
        { success: false, message: "User not found or inactive" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const requestedApp = body.app || "unknown";
    const requestedScopes = body.scopes || ["profile", "email"];

    /* ── Business tagging ─────────────────────────────────────────────
     * Every downstream platform (Native storefront, other business
     * front-ends, vendor portals) needs to know which businesses this
     * user belongs to. Vendors get their vendor-business memberships,
     * staff get theirs, super admins are flagged and can access all.
     *
     * Also surfaces vendor-staff memberships specifically (vendorId +
     * vendorRole) — part of the "every user signs up with plain customer
     * access, then a vendor or super admin assigns them a vendor code to
     * become that vendor's staff" flow. Consuming apps (including the
     * separate native frontend this SSO exists for) need this to know a
     * logged-in user is staff for a specific vendor, not just a generic
     * business member.
     */
    const memberships = (await BusinessMember.find({
      userId: user._id,
      status: "ACTIVE",
    })
      .select("businessId memberType vendorId vendorRole")
      .lean()) as any[];

    const businessIds = memberships.map((m) => String(m.businessId));
    const activeBusinessId =
      decoded.activeBusinessId && businessIds.includes(decoded.activeBusinessId)
        ? decoded.activeBusinessId
        : decoded.activeBusinessId && user.role === "SUPER_ADMIN"
        ? decoded.activeBusinessId
        : businessIds[0];
    const activeMembership = memberships.find(
      (m) => String(m.businessId) === activeBusinessId
    );
    const vendorMemberships = memberships
      .filter((m) => m.vendorId)
      .map((m) => ({ vendorId: String(m.vendorId), vendorRole: m.vendorRole || null, memberType: m.memberType }));

    const ssoToken = signSSOToken({
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      username: user.username || null,
      role: user.role,
      isSuperAdmin: user.role === "SUPER_ADMIN",
      permissions: requestedScopes,
      issuer: "an-group-erp",
      businessIds,
      activeBusinessId,
      memberType: activeMembership?.memberType,
      vendorMemberships,
    });

    return NextResponse.json({
      success: true,
      ssoToken,
      expiresIn: 3600, // 1 hour
      tokenType: "Bearer",
      app: requestedApp,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        username: user.username || null,
        role: user.role,
        avatar: user.avatar || null,
        businessIds,
        activeBusinessId: activeBusinessId || null,
        vendorMemberships,
      },
      verifyUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/sso/verify`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// Also allow GET with session cookie (for browser-based SSO)
export async function GET(req: Request) {
  return POST(req);
}
