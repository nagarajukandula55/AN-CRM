import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorPlan from "@/models/VendorPlan";

// GET /api/vendor/plans — active plan catalog for a logged-in vendor to
// pick from on their Billing page. Auth-gated (not public) even though
// there's nothing vendor-specific in the response, same as the rest of
// /api/vendor/* — no reason to expose pricing to logged-out traffic.
export async function GET(_req: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const plans = await VendorPlan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).lean();
    return NextResponse.json({ success: true, plans });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
