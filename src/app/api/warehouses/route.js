import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Warehouse from "@/models/Warehouse";
import Business from "@/models/Business";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

// GET /api/warehouses — previously returned EVERY warehouse across every
// business/vendor with no scoping at all. Now scoped:
//  - a VENDOR caller only ever sees warehouses under their own vendorId
//  - everyone else (business staff/admin) is scoped to their active
//    business, same pattern used across the rest of the app
//  - optional ?vendorId=... lets a business admin filter to one vendor's
//    warehouses specifically (e.g. from a vendor detail screen)
export async function GET(req) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session, buildPermissionCode("warehouses", "view"));
    } catch (err) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");

    const { searchParams } = new URL(req.url);
    const query = {};

    // A vendor-side caller (owner OR staff — see lib/auth/vendorContext.ts)
    // is always locked to their own vendor's warehouses — they should
    // never see another vendor's or the business's own warehouses.
    const callerVendorCtx = await resolveVendorContext(userId);
    if (callerVendorCtx) {
      query.vendorId = callerVendorCtx.vendor._id;
    } else {
      const activeBusinessId = h.get("x-active-business-id");
      if (activeBusinessId) query.businessId = activeBusinessId;
      const vendorIdFilter = searchParams.get("vendorId");
      if (vendorIdFilter) query.vendorId = vendorIdFilter;
    }

    const warehouses = await Warehouse.find(query).sort({ warehouseName: 1 });

    return NextResponse.json({
      success: true,
      data: warehouses,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session, buildPermissionCode("warehouses", "create"));
    } catch (err) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");

    const body = await req.json();

    // If the caller is a vendor, force the warehouse under their own
    // vendorId regardless of what the request body says — a vendor cannot
    // create a warehouse for the business or for another vendor.
    const callerVendorCtx = await resolveVendorContext(userId);
    if (callerVendorCtx) {
      body.vendorId = callerVendorCtx.vendor._id;
      body.businessId = callerVendorCtx.vendor.businessId;
    }

    // marketplace.enableWarehouse existed on Business but nothing ever
    // read it — any business could have warehouses regardless of this
    // toggle. Enforced here now; the same schema field also gates
    // vendor-portal entry (see api/vendor/dashboard's equivalent check).
    if (body.businessId) {
      const business = await Business.findById(body.businessId).select("marketplace name").lean();
      if (business && business.marketplace?.enableWarehouse === false) {
        return NextResponse.json(
          { success: false, message: `Warehouses are disabled for ${business.name || "this business"}.` },
          { status: 403 }
        );
      }
    }

    // Was manually typed in the creation form with no numbering at all
    // (and no uniqueness guarantee beyond whatever the admin happened to
    // type) -- auto-generate via the canonical numbering engine, same as
    // every other document type, choosing the WAREHOUSE vs SERVICE_CENTER
    // prefix by the warehouse's own type. Still honors an explicitly
    // provided warehouseCode if the caller already set one.
    if (!body.warehouseCode && body.businessId) {
      const documentType = body.warehouseType === "SERVICE_CENTER" ? "SERVICE_CENTER" : "WAREHOUSE";
      const { value } = await generateDocumentNumber(String(body.businessId), documentType);
      body.warehouseCode = value;
    }

    const warehouse = await Warehouse.create(body);

    return NextResponse.json({
      success: true,
      data: warehouse,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err.message,
      },
      { status: 500 }
    );
  }
}
