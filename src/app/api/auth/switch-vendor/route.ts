import { NextResponse } from "next/server";
import { verifyToken, signToken } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { logAction, actorFromPayload } from "@/lib/audit/logAction";

/**
 * POST /api/auth/switch-vendor
 * Body: { vendorId: string }
 *
 * Re-issues the JWT with a new activeVendorId claim.
 *
 * A parent vendor Owner who has created sub-vendors (VendorProfile.
 * parentVendorId, api/vendors/[id]/sub-vendors) shares the SAME businessId
 * as every one of their sub-vendors -- sub-vendors don't get their own
 * Business document, so switch-business/route.ts (which swaps
 * activeBusinessId) is the wrong mechanism for moving between them. What
 * actually distinguishes a parent from a sub-vendor is vendorId
 * (VendorProfile._id), so this is a parallel, narrower switch: only
 * between the caller's own vendor identity and a REAL sub-vendor of
 * theirs, verified by a DB lookup on every call -- never trusted from the
 * client, and never a way to view an unrelated vendor's data (that's
 * exactly the "act as any vendor" hole closed in switch-business today).
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

    const { vendorId } = await req.json();
    if (!vendorId) {
      return NextResponse.json({ success: false, message: "vendorId required" }, { status: 400 });
    }

    await connectDB();

    // Resolve the caller's OWN vendor identity live -- never trust a prior
    // activeVendorId claim as "who the caller really is" for this check.
    const ownCtx = await resolveVendorContext(payload.id);
    const ownVendorId = ownCtx?.vendor?._id ? String(ownCtx.vendor._id) : null;
    if (!ownVendorId) {
      return NextResponse.json({ success: false, message: "No vendor account found" }, { status: 403 });
    }

    let authorized = false;
    if (vendorId === ownVendorId) {
      // Switching back to self.
      authorized = true;
    } else {
      const target = await VendorProfile.findOne({ _id: vendorId, isDeleted: { $ne: true } })
        .select("parentVendorId")
        .lean<any>();
      authorized = !!target && String(target.parentVendorId || "") === ownVendorId;
    }

    if (!authorized) {
      return NextResponse.json(
        { success: false, message: "You do not have access to this vendor" },
        { status: 403 }
      );
    }

    const newToken = signToken({
      id:               payload.id,
      email:            payload.email,
      name:             payload.name,
      role:             payload.role,
      isSuperAdmin:     payload.isSuperAdmin,
      isPlatformStaff:  payload.isPlatformStaff,
      businessIds:      payload.businessIds,
      activeBusinessId: payload.activeBusinessId,
      activeVendorId:   vendorId === ownVendorId ? undefined : vendorId,
      organizationId:   payload.organizationId,
      centralRole:      payload.centralRole,
    });

    const res = NextResponse.json({ success: true, token: newToken, activeVendorId: vendorId });

    res.cookies.set("an_token", newToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 7,
      path:     "/",
    });

    logAction({
      action: "SWITCH_VENDOR",
      entity: "VendorProfile",
      entityId: vendorId,
      metadata: { fromActiveVendorId: payload.activeVendorId || ownVendorId },
      req,
      actor: { ...actorFromPayload(payload), businessId: payload.activeBusinessId },
    });

    return res;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
