import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorStaffSlot from "@/models/VendorStaffSlot";
import VendorProfile from "@/models/VendorProfile";
import BusinessMember, { BusinessMemberStatus } from "@/models/BusinessMember";
import User from "@/models/User";
import { grantVendorStaffAccess } from "@/core/access/vendorAccess.service";
import { logAction } from "@/lib/audit/logAction";

// REBUILT: designations no longer map to fixed job-title roles (that
// whole role set was withdrawn) -- they map to a starting per-module
// access grant through the same grantVendorStaffAccess() mechanism the
// vendor's own Team & Access UI uses. The vendor's Owner/Manager can
// widen/narrow it afterwards from their profile page.
const DESIGNATION_TO_MODULES: Record<string, { modules: string[]; isManager?: boolean }> = {
  MANAGER: { modules: [], isManager: true },
  CCO: { modules: ["crm", "crm_calls", "crm_jobsheets", "fault_codes", "solutions", "inventory"] },
  TELECALLER: { modules: ["crm", "crm_calls", "crm_jobsheets", "fault_codes", "solutions"] },
  ENGINEER: { modules: ["crm", "crm_calls", "crm_jobsheets", "fault_codes", "solutions", "inventory"] },
  WAREHOUSE_MANAGER: { modules: ["inventory", "warehouses", "stock_transfers", "stock_adjustments", "grn", "products", "vendor_products"] },
};

/**
 * POST /api/admin/vendor-staff-slots/[id]/activate — Super Admin only,
 * per explicit requirement ("super admin will enable them when required
 * and tag user ID to make user live"). Body: { username }. Looks up the
 * existing user by their public username (same "vendor code" pattern
 * /api/admin/vendor-staff already uses), links them as this designation's
 * BusinessMember, and marks the slot ACTIVE.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const h = await headers();
    const callerId = h.get("x-user-id");
    const callerIsSuperAdmin = h.get("x-is-super-admin") === "true";
    if (!callerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!callerIsSuperAdmin) {
      return NextResponse.json({ success: false, error: "Only Super Admins can activate a staff slot" }, { status: 403 });
    }

    const { id } = await context.params;
    const { username } = await req.json();
    if (!username?.trim()) {
      return NextResponse.json({ success: false, error: "username is required" }, { status: 400 });
    }

    const slot = await VendorStaffSlot.findById(id);
    if (!slot) {
      return NextResponse.json({ success: false, error: "Slot not found" }, { status: 404 });
    }
    if (slot.status === "ACTIVE") {
      return NextResponse.json({ success: false, error: "This slot is already active" }, { status: 409 });
    }

    const vendor = await VendorProfile.findById(slot.vendorId).lean();
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
    }

    const targetUser = await User.findOne({ username: username.toLowerCase().trim(), isDeleted: { $ne: true } }).lean();
    if (!targetUser) {
      return NextResponse.json({ success: false, error: "No user found with that ID" }, { status: 404 });
    }

    // Designation -> BusinessMember.memberType, reusing the existing
    // vendor-flavored enum (see core/constants/businessMemberTypes.ts).
    const MEMBER_TYPE: Record<string, string> = {
      CCO: "CCO",
      ENGINEER: "ENGINEER",
      WAREHOUSE_MANAGER: "VENDOR_WAREHOUSE",
      TELECALLER: "VENDOR_HELPER",
    };

    const member = await BusinessMember.findOneAndUpdate(
      { userId: targetUser._id, businessId: vendor.businessId, vendorId: vendor._id },
      {
        $set: {
          status: BusinessMemberStatus.ACTIVE,
          memberType: MEMBER_TYPE[slot.designation] || "VENDOR_HELPER",
          vendorRole: slot.designation,
          invitedBy: callerId,
          isDeleted: false,
        },
        $setOnInsert: { joinedAt: new Date(), isDefaultBusiness: false },
      },
      { upsert: true, new: true }
    );

    slot.status = "ACTIVE";
    slot.userId = targetUser._id as any;
    slot.activatedAt = new Date();
    await slot.save();

    // Grant the designation's starting module access through the same
    // mechanism the vendor's own Team & Access UI uses -- so the user's
    // session resolves real permissions immediately, and the vendor's
    // Owner/Manager can adjust it afterwards from their profile page.
    const preset = DESIGNATION_TO_MODULES[slot.designation];
    if (preset) {
      await grantVendorStaffAccess({
        userId: String(targetUser._id),
        businessId: String(vendor.businessId),
        vendorId: String(vendor._id),
        modules: preset.modules,
        isManager: preset.isManager,
        grantedBy: callerId || undefined,
      }).catch(() => {});
    }

    logAction({
      action: "UPDATE",
      entity: "VendorStaffSlot",
      entityId: slot._id?.toString(),
      after: { status: "ACTIVE", userId: targetUser._id, designation: slot.designation },
      req,
      actor: { id: callerId },
    });

    return NextResponse.json({ success: true, slot, member });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
