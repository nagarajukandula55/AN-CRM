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

export async function GET(
  req: Request,
  context: any
) {
  try {
    await connectDB();

    const record =
      await VendorCatalog.findById(
        (await context.params).id
      )
        .populate("vendorId")
        .populate("productId")
        .populate("variantId");

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

export async function PUT(
  req: Request,
  context: any
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("vendor_products", "edit"));
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
      await VendorCatalog.findByIdAndUpdate(
        (await context.params).id,
        body,
        {
          new: true,
        }
      );

    logAction({
      action: "UPDATE",
      entity: "VendorCatalog",
      entityId: (await context.params).id,
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

export async function DELETE(
  req: Request,
  context: any
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("vendor_products", "delete"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    await VendorCatalog.findByIdAndUpdate(
      (await context.params).id,
      {
        active: false,
        status: "INACTIVE",
      }
    );

    logAction({
      action: "DELETE",
      entity: "VendorCatalog",
      entityId: (await context.params).id,
      req,
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
