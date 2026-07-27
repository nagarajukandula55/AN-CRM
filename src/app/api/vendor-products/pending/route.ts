import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

import VendorProduct from "@/models/VendorProduct";
// Required for .populate("vendorId") below -- see the identical fix/comment
// in api/admin/vendor-settlements/route.ts.
import "@/models/VendorProfile";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/ProductCategory";
import "@/models/Brand";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function GET() {
  try {
    // Was completely unauthenticated -- any caller could list every
    // pending vendor product across every vendor's business, including
    // pricing/cost data. Matches the same isSuperAdmin-only restriction
    // the approve/reject actions on these products already enforce (see
    // api/vendor-products/[id]/approve/route.ts's own comment on why this
    // is deliberately Super-Admin-only, not a generic permission).
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Only an AN Group Super Admin can view pending approvals." }, { status: 403 });
    }

    await connectDB();

    const products =
      await VendorProduct.find({
        approvalStatus: {
          $in: [
            "PENDING",
            "UNDER_REVIEW",
          ],
        },
      })
        .populate("vendorId")
        .populate("categoryId")
        .populate("brandId")
        .sort({
          submittedAt: -1,
        });

    return NextResponse.json({
      success: true,
      data: products,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err.message,
      },
      { status: 500 }
    );
  }
}
