import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import Warehouse from "@/models/Warehouse";
import User from "@/models/User";
import BusinessMember from "@/models/BusinessMember";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { generateDocumentNumber, generateScopedDocumentNumber } from "@/core/numbering/numberingService";

// Maps each facility toggle to the document type used to generate its
// facility ID, and the VendorProfile field that stores the generated ID.
const FACILITY_ID_MAP: Record<
  string,
  { documentType: "STORE_FRONT" | "SERVICE_CENTER" | "WAREHOUSE"; idField: string }
> = {
  enableStoreFront:    { documentType: "STORE_FRONT",    idField: "storeFrontId" },
  enableServiceCenter: { documentType: "SERVICE_CENTER", idField: "serviceCenterId" },
  enableWarehouse:     { documentType: "WAREHOUSE",       idField: "warehouseFacilityId" },
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const vendor = await VendorProfile.findById(id).populate("userId", "name email username");
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: vendor });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await getEnrichedSession();
    try {
      requirePermission(session as any, buildPermissionCode("vendors", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();

    const existing = await VendorProfile.findById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
    }

    // Reassigning the Owner (VendorProfile.userId) -- this route previously
    // accepted an arbitrary request body with zero validation, so a raw
    // `userId` in the body would silently point a vendor's Owner at any
    // ObjectId-shaped string, valid user or not. Validated here since the
    // admin Vendor detail page now exposes a real "change Owner" action
    // that sends this field.
    if (body.userId !== undefined && body.userId !== null && body.userId !== "") {
      const targetUser = await User.findOne({ _id: body.userId, isDeleted: { $ne: true } }).select("_id").lean();
      if (!targetUser) {
        return NextResponse.json({ success: false, error: "That user account was not found" }, { status: 400 });
      }
      // Same rule as the VENDOR_TEAM promote track: a user is on exactly one
      // vendor at a time, so becoming this vendor's Owner deactivates any
      // OTHER vendor-team membership they were still carrying (stale test
      // data, a prior assignment, etc.) rather than leaving it to silently
      // outrank this one in resolveVendorContext.
      await BusinessMember.updateMany(
        { userId: body.userId, vendorId: { $ne: null, $nin: [id] }, isDeleted: { $ne: true } },
        { $set: { status: "INACTIVE", isDeleted: true } }
      );
    }

    // For every facility toggle flipping false -> true in this update,
    // generate a real facility ID exactly once via the canonical numbering
    // engine, and never regenerate it if already set.
    for (const [toggleKey, { documentType, idField }] of Object.entries(FACILITY_ID_MAP)) {
      const turningOn = body[toggleKey] === true && !(existing as any)[toggleKey];
      const alreadyHasId = !!(existing as any)[idField];
      if (turningOn && !alreadyHasId && existing.businessId) {
        if (documentType === "SERVICE_CENTER") {
          // Service Centre id is "<vendorId>-SC-0001" -- scoped per vendor,
          // same pattern as vendor-scoped material codes -- not a flat
          // business-wide SC-0001 counter shared across every vendor.
          const { sequence } = await generateScopedDocumentNumber(
            String(existing._id),
            documentType,
            String(existing.businessId)
          );
          body[idField] = `${existing.vendorId}-SC-${String(sequence).padStart(4, "0")}`;
        } else {
          const { value } = await generateDocumentNumber(String(existing.businessId), documentType, {
            vendorId: existing.vendorId || "",
          });
          body[idField] = value;
        }
      }
    }

    const vendor = await VendorProfile.findByIdAndUpdate(id, body, { new: true }).populate("userId", "name email username");

    // Enabling the warehouse facility toggle only ever stamped an ID onto
    // VendorProfile.warehouseFacilityId -- nothing ever created a real
    // Warehouse record from it, so the vendor's own Warehouses page
    // (which reads /api/warehouses, scoped by vendorId) stayed empty even
    // after "enabling" a warehouse. Auto-create one, using the generated
    // facility code as the warehouse code, the first time the toggle turns
    // on -- the vendor can still edit/rename it afterward like any other
    // warehouse they create themselves.
    if (
      vendor &&
      body.enableWarehouse === true &&
      !existing.enableWarehouse &&
      body.warehouseFacilityId
    ) {
      const alreadyExists = await Warehouse.findOne({ warehouseCode: body.warehouseFacilityId });
      if (!alreadyExists) {
        await Warehouse.create({
          businessId: vendor.businessId,
          vendorId: vendor._id,
          warehouseCode: body.warehouseFacilityId,
          warehouseName: `${vendor.companyName} Warehouse`,
          warehouseType: "FINISHED_GOODS",
          active: true,
        });
      }
    }
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "VendorProfile",
      entityId: id,
      after: body,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, data: vendor });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    await VendorProfile.findByIdAndUpdate(id, { isDeleted: true });

    logAction({
      action: "DELETE",
      entity: "VendorProfile",
      entityId: id,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
