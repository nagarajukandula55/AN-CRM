import { NextResponse } from "next/server";
import { verifyToken, signToken } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/mongodb";
import BusinessMember from "@/models/BusinessMember";
import Business from "@/models/Business";
import { logAction, actorFromPayload } from "@/lib/audit/logAction";

/**
 * POST /api/auth/switch-business
 * Body: { businessId: string }
 *
 * Re-issues the JWT with a new activeBusinessId.
 * - Super admins can switch to ANY business in the system.
 * - Regular users can only switch to their assigned (ACTIVE) businesses.
 */
export async function POST(req: Request) {
  try {
    /* ── Authenticate ──────────────────────────────────────────────── */
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

    const { businessId } = await req.json();
    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId required" }, { status: 400 });
    }

    await connectDB();

    /* ── Authorise the switch ──────────────────────────────────────── */
    if (payload.isSuperAdmin || payload.isPlatformStaff) {
      // Super admin / AN Group platform staff can switch to any active business
      const biz = await (Business as any).findById(businessId).select("_id name").lean();
      if (!biz) {
        return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
      }
    } else {
      // Regular user — must have an ACTIVE membership
      const membership = await BusinessMember.findOne({
        userId: payload.id,
        businessId,
        status: "ACTIVE",
      }).lean();

      if (!membership) {
        return NextResponse.json(
          { success: false, message: "You do not have access to this business" },
          { status: 403 }
        );
      }
    }

    /* ── Re-issue token with new activeBusinessId ──────────────────── */
    // Build updated businessIds for super admin (they don't have a fixed list)
    let businessIds = payload.businessIds;
    if ((payload.isSuperAdmin || payload.isPlatformStaff) && !businessIds.includes(businessId)) {
      businessIds = [...businessIds, businessId];
    }

    const newToken = signToken({
      id:               payload.id,
      email:            payload.email,
      name:             payload.name,
      role:             payload.role,
      isSuperAdmin:     payload.isSuperAdmin,
      isPlatformStaff:  payload.isPlatformStaff,
      businessIds,
      activeBusinessId: businessId,
      organizationId:   payload.organizationId,
    });

    const res = NextResponse.json({
      success: true,
      token: newToken,
      activeBusinessId: businessId,
    });

    res.cookies.set("an_token", newToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 7,
      path:     "/",
    });

    // Fire-and-forget audit log — never blocks or fails the actual switch.
    logAction({
      action: "SWITCH_BUSINESS",
      entity: "Business",
      entityId: businessId,
      metadata: { fromActiveBusinessId: payload.activeBusinessId || null },
      req,
      actor: { ...actorFromPayload(payload), businessId },
    });

    return res;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
