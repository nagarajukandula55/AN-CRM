/**
 * SSO Token Verification Endpoint
 *
 * PUBLIC endpoint — called by external apps to verify SSO tokens
 * Returns: user info + permissions if token is valid
 *
 * Usage from external app:
 *   POST /api/sso/verify
 *   Body: { token: "<sso_token>" }
 */

import { NextResponse } from "next/server";
import { verifySSOToken } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { valid: false, message: "Token required" },
        { status: 400 }
      );
    }

    const payload = verifySSOToken(token);
    if (!payload) {
      return NextResponse.json(
        { valid: false, message: "Invalid or expired SSO token" },
        { status: 401 }
      );
    }

    // Optionally re-validate user is still active
    await connectDB();
    const user = await User.findById(payload.userId)
      .select("isActive isDeleted name email role avatar")
      .lean()
      .exec() as any;

    if (!user || !user.isActive || user.isDeleted) {
      return NextResponse.json(
        { valid: false, message: "User account is inactive" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      valid: true,
      user: {
        id: payload.userId,
        email: payload.email,
        name: payload.name,
        username: payload.username || null,
        role: payload.role,
        isSuperAdmin: payload.isSuperAdmin,
        avatar: user.avatar || null,
        // Business tagging — consuming platforms scope everything by this
        businessIds: payload.businessIds || [],
        activeBusinessId: payload.activeBusinessId || null,
        memberType: payload.memberType || null,
        // Vendor-staff scoping — lets a consuming app (e.g. the native
        // frontend) know this user is staff for a specific vendor, with
        // what role, not just a generic business member. See
        // /api/vendor/staff and /api/admin/vendor-staff for how this gets
        // assigned via the user's username ("vendor code").
        vendorMemberships: payload.vendorMemberships || [],
      },
      permissions: payload.permissions,
      issuer: payload.issuer,
      issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { valid: false, message: error.message },
      { status: 500 }
    );
  }
}

// CORS preflight for cross-origin apps
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
