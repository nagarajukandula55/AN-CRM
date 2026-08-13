import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import StockLedger from "@/models/StockLedger";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Material";
import "@/models/Warehouse";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";

export async function GET(req: NextRequest) {
  // SECURITY: had no auth check and no businessId scoping at all --
  // dumped the entire platform's stock ledger to any caller.
  const session = await getEnrichedSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  await connectDB();

  const scope = await resolveAuthorizedVendorScope(
    session.user.id,
    req.nextUrl.searchParams.get("businessId") || req.headers.get("x-active-business-id"),
    session.isSuperAdmin,
    session.business?.businessId || null
  );
  const businessId = scope?.businessId || null;
  if (!businessId && !session.isSuperAdmin) {
    return NextResponse.json({ success: true, data: [] });
  }

  const filter: Record<string, unknown> = businessId ? { businessId } : {};
  if (scope?.vendorId) filter.vendorId = scope.vendorId;

  const data = await StockLedger.find(filter)
    .populate("materialId")
    .populate("warehouseId")
    .sort({ createdAt: -1 });

  return NextResponse.json({ success: true, data });
}
