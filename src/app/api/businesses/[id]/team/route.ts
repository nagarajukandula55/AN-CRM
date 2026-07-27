import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import BusinessMember, { BusinessMemberStatus } from "@/models/BusinessMember";
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";
import { logAction } from "@/lib/audit/logAction";

// The only roles a business Owner may hand out to their own team --
// mirrors the vendor team-grant pattern (a vendor can only grant from its
// own fixed set, never invent one or reach OWNER). Assigning a business's
// Owner is Super-Admin-only, done via /api/admin/users/[id]/businesses.
const OWNER_ASSIGNABLE_ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"];

/**
 * POST /api/businesses/[id]/team
 * Body: { targetUserId, roleCode }
 * Caller must themselves be an ACTIVE BusinessMember with memberType
 * "OWNER" for this business. The target user must already be attached to
 * this business (via Super Admin's /api/admin/users/[id]/businesses) --
 * this route only changes their role within it, it doesn't attach new
 * people to the business.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers();
    const callerId = h.get("x-user-id");
    if (!callerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id: businessId } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return NextResponse.json({ success: false, error: "Invalid business id" }, { status: 400 });
    }

    await connectDB();

    const callerMembership = await BusinessMember.findOne({
      userId: callerId,
      businessId,
      memberType: "OWNER",
      status: BusinessMemberStatus.ACTIVE,
      isDeleted: { $ne: true },
    }).lean();
    if (!callerMembership) {
      return NextResponse.json(
        { success: false, error: "Only this business's Owner can assign roles to its team" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { targetUserId, roleCode } = body;

    if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return NextResponse.json({ success: false, error: "targetUserId is required" }, { status: 400 });
    }
    const requestedRole = String(roleCode || "").toUpperCase();
    if (!OWNER_ASSIGNABLE_ROLES.includes(requestedRole)) {
      return NextResponse.json(
        { success: false, error: `roleCode must be one of: ${OWNER_ASSIGNABLE_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const targetMembership = await BusinessMember.findOne({
      userId: targetUserId,
      businessId,
      isDeleted: { $ne: true },
    });
    if (!targetMembership) {
      return NextResponse.json(
        { success: false, error: "This user must be attached to your business by Super Admin before you can assign them a role" },
        { status: 403 }
      );
    }

    const roleDoc = await Role.findOne({ code: requestedRole, businessId: null, vendorId: null });
    if (!roleDoc) {
      return NextResponse.json({ success: false, error: `Role "${requestedRole}" is not configured` }, { status: 400 });
    }

    targetMembership.memberType = requestedRole as any;
    targetMembership.status = BusinessMemberStatus.ACTIVE;
    await targetMembership.save();

    await UserRole.updateOne(
      { userId: targetUserId, roleId: roleDoc._id },
      { $setOnInsert: { userId: targetUserId, roleId: roleDoc._id, businessId, assignedBy: callerId } },
      { upsert: true }
    );

    logAction({
      action: "UPDATE",
      entity: "BusinessMember",
      entityId: targetMembership._id?.toString(),
      after: { targetUserId, roleCode: requestedRole },
      req,
      actor: { id: callerId, businessId },
    });

    return NextResponse.json({ success: true, message: `Assigned ${requestedRole}` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
