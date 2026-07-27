import { NextResponse } from "next/server";
import { verifyToken, signToken } from "@/lib/auth/jwt";
import { logAction, actorFromPayload } from "@/lib/audit/logAction";

/**
 * POST /api/auth/exit-business
 *
 * Clears activeBusinessId from the JWT, returning a super admin (or any
 * user with multiple business memberships) to the overall/unscoped admin
 * view. This is the counterpart to /api/auth/switch-business — until this
 * route existed there was no way to leave a business context you'd
 * switched into short of logging out entirely.
 */
export async function POST(req: Request) {
  try {
    const cookieHeader = req.headers.get("Cookie") || "";
    const tokenMatch = cookieHeader.match(/(?:^|;\s*)an_token=([^;]+)/);
    const token = tokenMatch?.[1];

    if (!token) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, message: "Invalid token" }, { status: 401 });
    }

    const previousBusinessId = payload.activeBusinessId || null;

    const newToken = signToken({
      id:               payload.id,
      email:            payload.email,
      name:             payload.name,
      role:             payload.role,
      isSuperAdmin:     payload.isSuperAdmin,
      isPlatformStaff:  payload.isPlatformStaff,
      businessIds:      payload.businessIds,
      activeBusinessId: undefined,
      organizationId:   payload.organizationId,
    });

    const res = NextResponse.json({
      success: true,
      token: newToken,
      activeBusinessId: null,
    });

    res.cookies.set("an_token", newToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 7,
      path:     "/",
    });

    logAction({
      action: "EXIT_BUSINESS",
      entity: "Business",
      entityId: previousBusinessId,
      metadata: { exitedFromBusinessId: previousBusinessId },
      req,
      actor: { ...actorFromPayload(payload), businessId: previousBusinessId || undefined },
    });

    return res;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
