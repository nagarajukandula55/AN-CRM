import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorSettlement from "@/models/VendorSettlement";
// Required for .populate("vendorId", ...) below -- Mongoose only knows how
// to populate a ref if that model has actually been registered somewhere
// in the current process. Nothing else in this route's import graph pulled
// VendorProfile in, so this route 500'd unconditionally with "Schema
// hasn't been registered for model 'VendorProfile'" the moment any
// settlement existed to populate.
import "@/models/VendorProfile";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

/* =========================================================
 * GET /api/admin/vendor-settlements?businessId=&status=
 * Admin visibility into vendor payout settlements — what's owed, what's
 * been transferred, and what failed/pending, per business.
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("vendor_settlements", "view"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }
    await connectDB();
    const h = await headers();

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId") || h.get("x-active-business-id");
    const status = searchParams.get("status");

    if (!businessId) {
      return NextResponse.json({ success: false, error: "businessId is required" }, { status: 400 });
    }

    const query: Record<string, unknown> = { businessId };
    if (status) query.status = status;

    const settlements = await VendorSettlement.find(query)
      .populate("vendorId", "companyName vendorId")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const totals = settlements.reduce(
      (acc, s: any) => {
        acc.gross += s.grossAmount;
        acc.commission += s.platformCommissionAmount;
        acc.net += s.netPayoutAmount;
        if (s.status === "PENDING" || s.status === "FAILED") acc.outstanding += s.netPayoutAmount;
        return acc;
      },
      { gross: 0, commission: 0, net: 0, outstanding: 0 }
    );

    return NextResponse.json({ success: true, settlements, data: settlements, totals });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
