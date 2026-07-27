import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SupportTicket from "@/models/SupportTicket";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// GET /api/support-tickets?businessId=&status=
// businessId is now OPTIONAL for a Super Admin -- per explicit direction,
// this list should show tickets across every business by default rather
// than depending on the sidebar's active-business switcher (which was
// reported as unreliable). A non-super-admin still needs a real businessId
// to view anything.
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("support_tickets", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const status = searchParams.get("status");
    if (!businessId && !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    await connectDB();
    const query: Record<string, unknown> = {};
    if (businessId) query.businessId = businessId;
    if (status) query.status = status;

    const tickets = await SupportTicket.find(query).sort({ createdAt: -1 }).lean();

    // Business names for display -- the list is now cross-business by
    // default, so each row needs to say which business it belongs to.
    const businessIds = Array.from(new Set(tickets.map((t: any) => String(t.businessId))));
    const businesses = await Business.find({ _id: { $in: businessIds } }).select("name").lean();
    const nameById = new Map(businesses.map((b: any) => [String(b._id), b.name]));
    const enriched = tickets.map((t: any) => ({ ...t, businessName: nameById.get(String(t.businessId)) || "" }));

    return NextResponse.json({ success: true, tickets: enriched });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
