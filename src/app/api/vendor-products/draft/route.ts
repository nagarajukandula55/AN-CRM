import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorProduct from "@/models/VendorProduct";
import VendorProfile from "@/models/VendorProfile";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { createDefaultVendorRoles } from "@/core/access/vendorDefaultRoles.service";

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    // Self-healing resync before the permission check: a vendor-team
    // member's default roles (Owner/Manager/etc.) can go stale relative
    // to the current role-definition/module-intersection logic (e.g. a
    // bug fix, or the parent business enabling a new module) -- this is
    // the exact action (adding a product) that was hitting a stale-403
    // wall, so refresh right here rather than only when the vendor
    // happens to visit their Staff page.
    const h = await headers();
    const requestingUserId = h.get("x-user-id");
    if (requestingUserId) {
      const requestingVendor = await VendorProfile.findOne({
        userId: requestingUserId,
        isDeleted: { $ne: true },
      })
        .select("_id businessId")
        .lean();
      if (requestingVendor && (requestingVendor as any).businessId) {
        await createDefaultVendorRoles(
          String((requestingVendor as any)._id),
          String((requestingVendor as any).businessId)
        ).catch(() => {});
      }
    }

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

    const body = await req.json().catch(() => ({}));

    if (!body.businessId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No active business context — please select a business before creating a product draft.",
        },
        { status: 400 }
      );
    }

    // Resolve which vendor this draft belongs to from the real session --
    // was never set at all before, despite VendorProduct.vendorId being a
    // real relation. A vendor-portal user (VendorProfile.userId === them)
    // gets their own vendor stamped; a super admin creating a product
    // directly (not via a vendor's own login) has no personal vendor, so
    // vendorId stays unset in that case rather than guessing at one.
    const vendorProfile = await VendorProfile.findOne({
      userId: session.user.id,
      businessId: body.businessId,
    }).lean();

    // Cloning an existing draft is how "+ Create another variant" (Review
    // step) starts a new pack-size/size of the SAME product -- carries over
    // everything that describes the product itself (name, category, brand,
    // description, images, SEO) but leaves structure/BOM/commercial blank
    // for the new variant to fill in. Only honored for a draft the caller's
    // own vendor actually owns.
    let cloneFrom: any = null;
    if (body.cloneFromDraftId) {
      cloneFrom = await VendorProduct.findOne({
        _id: body.cloneFromDraftId,
        businessId: body.businessId,
      }).lean();
    }

    const draft = await VendorProduct.create({
      productName: cloneFrom?.productName || "",
      variantName: "",
      description: cloneFrom?.description || "",
      categoryId: cloneFrom?.categoryId || undefined,
      brandId: cloneFrom?.brandId || undefined,
      images: cloneFrom?.images || [],
      seo: cloneFrom?.seo || undefined,
      clonedFromDraftId: cloneFrom?._id || null,

      vendorSku: "",
      vendorCost: 0,
      vendorShippingCost: 0,
      shippingCostType: "SEPARATE",
      minimumOrderQty: 1,
      leadTimeDays: 0,
      availableStock: 0,

      unit: "",
      packSize: 1,
      netWeight: 0,
      grossWeight: 0,
      hsnCode: cloneFrom?.hsnCode || "",
      gstRate: cloneFrom?.gstRate || 0,

      status: "DRAFT",
      active: true,

      businessId: body.businessId,
      vendorId: (vendorProfile as any)?._id || undefined,
      createdBy: body.createdBy || session.user.id,
    });

    logAction({
      action: "SAVE_DRAFT",
      entity: "VendorProduct",
      entityId: draft._id?.toString(),
      after: draft,
      req,
      actor: { businessId: body.businessId, id: body.createdBy },
    });

    return NextResponse.json({
      success: true,
      id: draft._id.toString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
