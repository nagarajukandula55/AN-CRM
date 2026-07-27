import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { retryPendingSettlement } from "@/core/payouts/vendorSettlement.service";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
 * POST /api/admin/vendor-settlements/[id]/retry
 * Re-attempts a PENDING or FAILED settlement's Razorpay transfer — used
 * once a vendor's payout account has since been activated, or after
 * fixing whatever caused a transfer to fail.
 * =======================================================*/
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const settlement = await retryPendingSettlement(id);

    logAction({
      action: "UPDATE",
      entity: "VendorSettlement",
      entityId: id,
      after: settlement,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, settlement });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
