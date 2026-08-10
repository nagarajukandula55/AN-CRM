import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getInventoryValuation } from "@/services/stockValuation.service";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

export async function GET(req: NextRequest) {
  try {
    // SECURITY: had no auth check and no ownership check -- any caller
    // could pull inventory valuation (or, worse, omitting businessId,
    // possibly platform-wide) for any business.
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    await connectDB();

    const { searchParams } = new URL(req.url);

    const businessId = await resolveAuthorizedBusinessId(
      session.user.id,
      searchParams.get("businessId"),
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    if (!businessId && !session.isSuperAdmin) {
      return NextResponse.json({ success: true, data: [] });
    }

    const data = await getInventoryValuation({ businessId });

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
