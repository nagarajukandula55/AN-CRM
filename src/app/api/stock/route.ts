import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import StockLedger from "@/models/StockLedger";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Material";
import "@/models/Warehouse";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

export async function GET(req: NextRequest) {
  // SECURITY: had no auth check and no businessId scoping at all --
  // dumped the entire platform's stock ledger to any caller.
  const session = await getEnrichedSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  await connectDB();

  const businessId = await resolveAuthorizedBusinessId(
    session.user.id,
    req.nextUrl.searchParams.get("businessId") || req.headers.get("x-active-business-id"),
    session.isSuperAdmin,
    session.business?.businessId || null
  );
  if (!businessId && !session.isSuperAdmin) {
    return NextResponse.json({ success: true, data: [] });
  }

  const data = await StockLedger.find(businessId ? { businessId } : {})
    .populate("materialId")
    .populate("warehouseId")
    .sort({ createdAt: -1 });

  return NextResponse.json({ success: true, data });
}
