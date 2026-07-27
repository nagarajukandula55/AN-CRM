import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Feedback from "@/models/Feedback";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

/**
 * GET /api/admin/feedback — list customer feedback / contact-us submissions
 * for the active business (same x-active-business-id convention as
 * app/api/crm/calls/route.ts). Falls back to the query-string businessId
 * for super-admin/platform-staff "all businesses" browsing.
 *
 * Was missing authentication entirely -- ANY unauthenticated request with
 * no businessId got every business's customer feedback back (query {}).
 * Now requires a real session, and a non-platform-staff caller must supply
 * a businessId (never silently falls through to cross-business data).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const h = req.headers;
    const bizId = h.get("x-active-business-id") || req.nextUrl.searchParams.get("businessId");
    const status = req.nextUrl.searchParams.get("status");

    const isPlatformStaff = session.isSuperAdmin || h.get("x-is-platform-staff") === "true";
    if (!bizId && !isPlatformStaff) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const query: Record<string, unknown> = {};
    if (bizId) query.businessId = bizId;
    if (status && status !== "ALL") query.status = status;

    const items = await Feedback.find(query).sort({ createdAt: -1 }).limit(500).lean();

    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    console.error("Admin feedback GET error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
