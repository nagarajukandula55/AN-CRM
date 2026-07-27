import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import BusinessMember from "@/models/BusinessMember";
import { logAction } from "@/lib/audit/logAction";
import { resolveOwnerOrManagerVendor } from "@/core/access/vendorAccess.service";

type RouteContext = { params: Promise<{ id: string }> };

/** DELETE /api/vendor/staff/[id] — revoke a staff member's access to this
 * vendor. [id] is the BusinessMember _id, not the user's own id. */
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const vendor = await resolveOwnerOrManagerVendor(userId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Only a vendor's Owner or Manager can manage its own staff" }, { status: 403 });
    }

    const { id } = await context.params;
    const member = await BusinessMember.findOne({ _id: id, vendorId: vendor._id });
    if (!member) {
      return NextResponse.json({ success: false, error: "Staff member not found" }, { status: 404 });
    }

    member.isDeleted = true;
    await member.save();

    logAction({
      action: "DELETE",
      entity: "BusinessMember",
      entityId: id,
      req,
      actor: { id: userId, businessId: vendor.businessId?.toString() },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
