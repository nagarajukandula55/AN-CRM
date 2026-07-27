import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

import VendorCatalog from "@/models/VendorCatalog";
// Required for .populate("vendorId") below -- see the identical fix/comment
// in api/admin/vendor-settlements/route.ts.
import "@/models/VendorProfile";

import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Product";
import "@/models/ProductVariant";

export async function GET() {
  try {
    await connectDB();

    const catalog =
      await VendorCatalog.find({
        active: true,
      })
        .populate("vendorId")
        .populate("productId")
        .populate("variantId")
        .sort({
          createdAt: -1,
        });

    return NextResponse.json({
      success: true,
      data: catalog,
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

export async function POST(
  req: Request
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("vendor_products", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body =
      await req.json();

    const record =
      await VendorCatalog.create(
        body
      );

    logAction({
      action: "CREATE",
      entity: "VendorCatalog",
      entityId: record?._id?.toString(),
      after: record,
      req,
    });

    return NextResponse.json({
      success: true,
      data: record,
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
