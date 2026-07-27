/**
 * GET /api/auth/landing — resolves where an already-authenticated user
 * (valid an_token cookie, middleware already injected x-user-id) should
 * land, using the exact same rule api/auth/login/route.ts applies right
 * after a fresh login. Used by the root "/" page, which can't recompute
 * this itself (it's a client component with no user context of its own)
 * and previously just hardcoded '/admin' for everyone -- see
 * resolveLandingPath's own comment for why that went stale.
 */
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { resolveLandingPath } from "@/core/access/vendorAccess.service";

export async function GET() {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    const isSuperAdmin = h.get("x-is-super-admin") === "true";
    if (!userId) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
    }

    await connectDB();
    const landingPath = await resolveLandingPath(userId, isSuperAdmin);
    return NextResponse.json({ success: true, landingPath });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
