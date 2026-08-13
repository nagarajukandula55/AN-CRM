import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import StockLedger from "@/models/StockLedger";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";

export async function GET(req: NextRequest) {
  try {
    // SECURITY: had no auth check and no businessId scoping -- aggregated
    // stock across the entire platform for any caller.
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

    const match: Record<string, unknown> = {};
    if (businessId) match.businessId = new mongoose.Types.ObjectId(businessId);
    if (scope?.vendorId) match.vendorId = new mongoose.Types.ObjectId(scope.vendorId);

    const data = await StockLedger.aggregate([
      ...(Object.keys(match).length ? [{ $match: match }] : []),
      {
        $group: {
          _id: {
            materialId: "$materialId",
            warehouseId: "$warehouseId",
          },
          totalIn: {
            $sum: {
              $cond: [{ $eq: ["$type", "IN"] }, "$quantity", 0],
            },
          },
          totalOut: {
            $sum: {
              $cond: [{ $eq: ["$type", "OUT"] }, "$quantity", 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          materialId: "$_id.materialId",
          warehouseId: "$_id.warehouseId",
          availableStock: {
            $subtract: ["$totalIn", "$totalOut"],
          },
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
