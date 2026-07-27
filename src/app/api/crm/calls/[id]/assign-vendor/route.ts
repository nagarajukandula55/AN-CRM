import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmCall from "@/models/CrmCall";
import VendorProfile from "@/models/VendorProfile";
import { logAction } from "@/lib/audit/logAction";
import { notify } from "@/lib/notify";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

/**
 * PATCH /api/crm/calls/[id]/assign-vendor — manual fallback for when
 * pincode-based auto-routing (see api/appointment-requests/route.ts) found
 * zero or multiple candidate vendors and left the call/appointment tagged
 * "needsAssignment". Super-admin-only, same hardcoded-isSuperAdmin pattern
 * as businesses/[id]/default-public and businesses/[id]/status — this is a
 * cross-vendor dispatching decision, not a regular crm_calls edit any
 * business-scoped staff member should be able to make via the generic
 * PATCH /api/crm/calls/[id] route.
 */
export async function PATCH(req: NextRequest, context: any) {
  try {
    await connectDB();

    const id = context?.params?.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid call id" }, { status: 400 });
    }

    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "Only Super Admins can manually assign a vendor" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { vendorId } = body || {};
    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
      return NextResponse.json({ success: false, message: "A valid vendorId is required" }, { status: 400 });
    }

    const call = await CrmCall.findOne({ _id: id, isDeleted: false });
    if (!call) {
      return NextResponse.json({ success: false, message: "Call not found" }, { status: 404 });
    }

    const vendor = await VendorProfile.findOne({
      _id: vendorId,
      isDeleted: { $ne: true },
      businessId: call.businessId,
    })
      .select("_id companyName")
      .lean();
    if (!vendor) {
      return NextResponse.json(
        { success: false, message: "Vendor not found in this business" },
        { status: 404 }
      );
    }

    call.routedVendorId = new mongoose.Types.ObjectId(vendorId);
    call.tags = (call.tags || []).filter((t: string) => t !== "needsAssignment");
    if (!call.tags.includes(`matchedVendor:${vendorId}`)) {
      call.tags.push(`matchedVendor:${vendorId}`);
    }
    await call.save();

    notify({
      event: "NEW_CRM_CALL",
      businessId: String(call.businessId),
      message: `📌 Appointment ${call.callNumber} manually assigned to ${(vendor as any).companyName}\nCustomer: ${call.customerName}\nPhone: ${call.phone}`,
    }).catch(() => {});

    logAction({
      action: "UPDATE",
      entity: "CrmCall",
      entityId: id,
      after: { routedVendorId: vendorId },
      req,
      actor: { id: session.user.id, businessId: String(call.businessId) },
    });

    return NextResponse.json({ success: true, call });
  } catch (err: any) {
    console.error("Assign vendor PATCH error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
