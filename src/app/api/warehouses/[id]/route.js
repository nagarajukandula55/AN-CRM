import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Warehouse from "@/models/Warehouse";
import { resolveVendorContext } from "@/lib/auth/vendorContext";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

async function guard(action) {
  const session = await getEnrichedSession();
  if (!session?.user) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  try {
    requirePermission(session, buildPermissionCode("warehouses", action));
  } catch (err) {
    return { error: NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 }) };
  }
  return { session };
}

/** A vendor caller (owner OR staff — see lib/auth/vendorContext.ts) may
 * only touch their own warehouse. Business staff/admin are not restricted
 * here (broader business-level auth already gates access to this route at
 * all) — this only exists to stop vendor A from editing vendor B's
 * warehouse, or a business's own, via a guessed/known ID. */
async function assertVendorOwnsWarehouseOrNotVendor(userId, warehouse) {
  if (!warehouse) return true;
  const callerVendorCtx = await resolveVendorContext(userId);
  if (!callerVendorCtx) return true; // not a vendor caller — no extra restriction here
  return String(warehouse.vendorId || "") === String(callerVendorCtx.vendor._id);
}

export async function GET(req, { params }) {
  try {
    const { error } = await guard("view");
    if (error) return error;
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");

    const warehouse = await Warehouse.findById(params.id);
    if (!(await assertVendorOwnsWarehouseOrNotVendor(userId, warehouse))) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

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

export async function PUT(req, { params }) {
  try {
    const { error } = await guard("edit");
    if (error) return error;
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");

    const existing = await Warehouse.findById(params.id);
    if (!(await assertVendorOwnsWarehouseOrNotVendor(userId, existing))) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    // A vendor caller cannot reassign their warehouse to a different
    // vendor/business via this endpoint.
    const callerVendorCtx = await resolveVendorContext(userId);
    if (callerVendorCtx) {
      delete body.vendorId;
      delete body.businessId;
    }

    const warehouse = await Warehouse.findByIdAndUpdate(params.id, body, { new: true });

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

export async function DELETE(req, { params }) {
  try {
    const { error } = await guard("delete");
    if (error) return error;
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");

    const existing = await Warehouse.findById(params.id);
    if (!(await assertVendorOwnsWarehouseOrNotVendor(userId, existing))) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    await Warehouse.findByIdAndDelete(params.id);

    return NextResponse.json({
      success: true,
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
