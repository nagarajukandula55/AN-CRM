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
    const status = req.nextUrl.searchParams.get("status");
    const source = req.nextUrl.searchParams.get("source");
    const explicitBizId = req.nextUrl.searchParams.get("businessId");

    const isPlatformStaff = session.isSuperAdmin || h.get("x-is-platform-staff") === "true";
    // Platform staff only scopes to a business when they EXPLICITLY ask via
    // ?businessId= -- was falling back to x-active-business-id (whichever
    // business they happen to be scoped into for unrelated admin work),
    // which meant a Super Admin almost never saw in-app product feedback
    // (bug reports/enhancement requests) at all unless they happened to be
    // actively viewing the exact business that submitted it. That's why
    // submissions looked like they vanished ("said saved but not seen").
    // A non-platform-staff caller is unaffected -- still always scoped to
    // their own active business.
    const bizId = isPlatformStaff ? explicitBizId : (h.get("x-active-business-id") || explicitBizId);
    if (!bizId && !isPlatformStaff) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const query: Record<string, unknown> = {};
    if (bizId) query.businessId = bizId;
    if (status && status !== "ALL") query.status = status;
    if (source) query.source = source;

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
