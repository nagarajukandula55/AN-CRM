import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorProduct from "@/models/VendorProduct";
// Required for .populate("vendorId") below -- see the identical fix/comment
// in api/admin/vendor-settlements/route.ts.
import "@/models/VendorProfile";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/ProductCategory";
import "@/models/Brand";

export async function GET(req: NextRequest) {
  try {
    // Was completely unauthenticated with no scoping at all -- returned
    // EVERY vendor's product drafts (across every business) to anyone who
    // hit this URL, and never excluded soft-deleted (active: false) ones
    // either, so a deleted draft kept showing on /vendor/products forever.
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const filter: Record<string, unknown> = { active: { $ne: false } };

    // A super admin (or anyone with the broader vendor_products:view
    // permission, e.g. reviewing submissions) can see everything scoped by
    // an explicit businessId; a vendor's own login is always scoped to
    // just their own products, regardless of what they pass.
    let hasBroadAccess = session.isSuperAdmin;
    if (!hasBroadAccess) {
      try {
        requirePermission(session as any, buildPermissionCode("vendor_products", "view"));
        // Still narrow to their own vendor unless they're staff/admin
        // reviewing on behalf of the whole business -- resolveVendorContext
        // tells us which case this is.
        const ctx = await resolveVendorContext(session.user.id);
        if (ctx) {
          filter.vendorId = ctx.vendor._id;
        } else {
          hasBroadAccess = true;
        }
      } catch {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      }
    }

    if (hasBroadAccess) {
      const businessId = req.nextUrl.searchParams.get("businessId");
      if (businessId) filter.businessId = businessId;
    }

    const products =
      await VendorProduct.find(filter)
        .populate("vendorId")
        .populate("categoryId")
        .populate("brandId")
        .sort({ createdAt: -1 });

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

export async function POST(req: Request) {
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

    const body = await req.json();

    const product =
      await VendorProduct.create(body);

    logAction({
      action: "CREATE",
      entity: "VendorProduct",
      entityId: product._id?.toString(),
      after: product,
      req,
      actor: { businessId: body.businessId },
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
