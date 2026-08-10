import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import FaultCode from "@/models/FaultCode";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { logAction } from "@/lib/audit/logAction";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";
import { resolveOwnerOrManagerVendor, resolveVendorTeamMembership } from "@/core/access/vendorAccess.service";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

// SECURITY: PUT/DELETE below looked a fault code up by its Mongo _id ONLY
// -- no check that its vendorId/businessId belongs to the caller, so any
// authenticated user holding the generic fault_codes edit/delete
// permission could edit or deactivate another vendor's/business's fault
// code just by knowing/guessing its id.
// - vendorId set: vendor-private, only that same vendor's team may touch it.
// - vendorId null, businessId set: business-wide entry, scoped like any
//   other businessId-owned catalog record.
// - both null: global/platform-seeded, super admin only.
async function assertOwnsFaultCode(
  record: { vendorId?: unknown; businessId?: unknown } | null,
  userId: string,
  isSuperAdmin: boolean,
  sessionBusinessId: string | null
) {
  if (!record) return false;
  if (isSuperAdmin) return true;

  if (record.vendorId) {
    const ownerOrManager = await resolveOwnerOrManagerVendor(userId).catch(() => null);
    const teamMembership = ownerOrManager || (await resolveVendorTeamMembership(userId).catch(() => null));
    const callerVendorId = teamMembership ? String((teamMembership as any)._id) : null;
    return !!callerVendorId && callerVendorId === String(record.vendorId);
  }

  if (record.businessId) {
    const authorizedBusinessId = await resolveAuthorizedBusinessId(userId, String(record.businessId), isSuperAdmin, sessionBusinessId);
    return authorizedBusinessId === String(record.businessId);
  }

  return false;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("fault_codes", "edit"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    for (const field of ["code", "description", "category", "deviceCategory", "isActive", "businessScope", "businessIds", "parentId"]) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    await connectDB();
    const existing = await FaultCode.findById(id).lean();
    if (!existing || !(await assertOwnsFaultCode(existing as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ success: false, error: "Fault code not found" }, { status: 404 });
    }

    const faultCode = await FaultCode.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!faultCode) {
      return NextResponse.json({ success: false, error: "Fault code not found" }, { status: 404 });
    }

    logAction({ action: "UPDATE", entity: "FaultCode", entityId: id, after: updates, req });

    return NextResponse.json({ success: true, faultCode });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("fault_codes", "delete"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    await connectDB();
    const existing = await FaultCode.findById(id).lean();
    if (!existing || !(await assertOwnsFaultCode(existing as any, session.user.id, !!session.isSuperAdmin, session.business?.businessId || null))) {
      return NextResponse.json({ success: false, error: "Fault code not found" }, { status: 404 });
    }

    const faultCode = await FaultCode.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
    if (!faultCode) {
      return NextResponse.json({ success: false, error: "Fault code not found" }, { status: 404 });
    }

    logAction({ action: "DELETE", entity: "FaultCode", entityId: id, req });

    return NextResponse.json({ success: true, message: "Fault code deactivated" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
