import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProduct from "@/models/VendorProduct";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function POST(
  req: Request,
  context: any
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("vendor_products", "approve"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body = await req.json();

    const vendorProduct =
      await VendorProduct.findById(
        (await context.params).id
      );

    if (!vendorProduct) {
      return NextResponse.json(
        {
          success: false,
          message: "Not found",
        },
        { status: 404 }
      );
    }

    vendorProduct.approvalStatus =
      "REJECTED";

    vendorProduct.rejectionReason =
      body.reason || "";

    await vendorProduct.save();

    logAction({
      action: "REJECT",
      entity: "VendorProduct",
      entityId: (await context.params).id,
      after: { rejectionReason: vendorProduct.rejectionReason },
      req,
      actor: { businessId: vendorProduct.businessId?.toString() },
    });

    return NextResponse.json({
      success: true,
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
