import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProduct from "@/models/VendorProduct";
// Required for .populate("vendorId") below -- see the identical fix/comment
// in api/admin/vendor-settlements/route.ts.
import "@/models/VendorProfile";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/ProductCategory";
import "@/models/Brand";
import "@/models/User";

export async function GET(
  req: Request,
  context: any
) {
  try {
    // Was completely unauthenticated -- any caller, logged in or not,
    // could fetch full vendor product data (pricing, vendor cost, images,
    // ingredients, etc.) for any product by guessing/enumerating its id.
    // Same view-permission gate PUT/DELETE below already use.
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("vendor_products", "view"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const product =
      await VendorProduct.findById(
        (await context.params).id
      )
        .populate("vendorId")
        .populate("categoryId")
        .populate("brandId")
        .populate("approvedBy");

    return NextResponse.json({
      success: true,
      data: product,
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

    const body = await req.json();

    const productId = (await context.params).id;

    const product =
      await VendorProduct.findByIdAndUpdate(
        productId,
        body,
        { new: true }
      );

    logAction({
      action: "UPDATE",
      entity: "VendorProduct",
      entityId: productId,
      after: body,
      req,
      actor: { businessId: product?.businessId?.toString() },
    });

    return NextResponse.json({
      success: true,
      data: product,
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

    const productId = (await context.params).id;

    await VendorProduct.findByIdAndUpdate(
      productId,
      {
        active: false,
      }
    );

    logAction({
      action: "DELETE",
      entity: "VendorProduct",
      entityId: productId,
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
