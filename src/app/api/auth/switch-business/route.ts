import { NextResponse } from "next/server";
import { verifyToken, signToken } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/mongodb";
import BusinessMember from "@/models/BusinessMember";
import { logAction, actorFromPayload } from "@/lib/audit/logAction";
import { resolveCentralRoleForBusiness } from "@/lib/auth/resolveCentralRole";

/**
 * POST /api/auth/switch-business
 * Body: { businessId: string }
 *
 * Re-issues the JWT with a new activeBusinessId.
 *
 * SECURITY: super admin/platform staff used to be able to switch into ANY
 * business with no membership check at all -- since every subsequent
 * request scopes off the resulting activeBusinessId exactly like a real
 * vendor session (x-active-business-id header, middleware.ts), this let a
 * super admin operate the normal vendor console UI/API as that vendor --
 * create/edit/delete their job sheets, stock, sales, etc. Per explicit
 * direction, super admin's role is platform administration (billing,
 * Telegram config, cross-vendor READ visibility for admin/support
 * purposes via resolveAuthorizedBusinessId/resolveAuthorizedVendorScope,
 * which are untouched by this), not acting as a vendor inside their own
 * operational data. Now requires a real ACTIVE BusinessMember row for
 * EVERYONE, super admin included -- same check, no special case.
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
    // Everyone (including super admin/platform staff) must have a real
    // ACTIVE BusinessMember row for the target business -- no bypass.
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

    /* ── Re-issue token with new activeBusinessId ──────────────────── */
    let businessIds = payload.businessIds;
    if (!businessIds.includes(businessId)) {
      businessIds = [...businessIds, businessId];
    }

    // Re-resolve centralRole for the NEW active business -- same fix
    // applied to ANgroup's identical route: this previously carried no
    // centralRole at all after a switch, so sidebar page restrictions
    // stayed wrong (or vanished) until the next full login.
    const centralRole = await resolveCentralRoleForBusiness(payload.email, businessId);

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
      centralRole,
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
