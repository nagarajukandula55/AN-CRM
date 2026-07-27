import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import BusinessMember, { BusinessMemberStatus, BusinessMemberType } from "@/models/BusinessMember";
import Business from "@/models/Business";
import mongoose from "mongoose";

/**
 * GET /api/admin/users/[id]/businesses
 * List all businesses assigned to a user.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const isSuperAdmin = req.headers.get("x-is-super-admin") === "true";
    const userRole     = req.headers.get("x-user-role");
    if (!isSuperAdmin && userRole !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { id: userId } = await context.params;
    await connectDB();

    const memberships = await BusinessMember.find({ userId })
      .populate({ path: "businessId", select: "name brandName businessCode type isActive", model: "Business" })
      .lean() as any[];

    return NextResponse.json({
      success: true,
      businesses: memberships.map((m) => ({
        membershipId:      m._id.toString(),
        businessId:        m.businessId?._id?.toString() || m.businessId?.toString(),
        name:              m.businessId?.name || "",
        brandName:         m.businessId?.brandName || "",
        businessCode:      m.businessId?.businessCode || "",
        type:              m.businessId?.type || "",
        isActive:          m.businessId?.isActive ?? true,
        memberType:        m.memberType,
        status:            m.status,
        isDefaultBusiness: m.isDefaultBusiness,
        joinedAt:          m.joinedAt,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/users/[id]/businesses
 * Assign a business to a user (create or update BusinessMember).
 * Body: { businessId, memberType?, isDefault? }
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const isSuperAdmin = req.headers.get("x-is-super-admin") === "true";
    const userRole     = req.headers.get("x-user-role");
    const requesterId  = req.headers.get("x-user-id");

    if (!isSuperAdmin && userRole !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { id: userId } = await context.params;
    const body = await req.json();
    const { businessId, memberType = "EMPLOYEE", isDefault = false } = body;

    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId required" }, { status: 400 });
    }
    // Only Super Admin designates a business's Owner -- a business-level
    // "ADMIN" caller can attach/reassign staff (EMPLOYEE/VENDOR/CUSTOMER)
    // but can't mint another Owner.
    if (memberType === "OWNER" && !isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "Only Super Admin can assign a business Owner" },
        { status: 403 }
      );
    }

    await connectDB();

    // Verify the business exists
    const biz = await (Business as any).findById(businessId).select("_id name").lean();
    if (!biz) {
      return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
    }

    // If setting as default, clear existing default for this user
    if (isDefault) {
      await BusinessMember.updateMany({ userId }, { isDefaultBusiness: false });
    }

    // Upsert membership
    const membership = await BusinessMember.findOneAndUpdate(
      { userId, businessId },
      {
        $set: {
          memberType:        memberType as BusinessMemberType,
          status:            BusinessMemberStatus.ACTIVE,
          isDefaultBusiness: isDefault,
          invitedBy:         requesterId ? new mongoose.Types.ObjectId(requesterId) : undefined,
        },
        $setOnInsert: {
          joinedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, membership });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users/[id]/businesses
 * Remove a business assignment.
 * Body: { businessId }
 */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const isSuperAdmin = req.headers.get("x-is-super-admin") === "true";
    const userRole     = req.headers.get("x-user-role");
    if (!isSuperAdmin && userRole !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { id: userId } = await context.params;
    const body = await req.json();
    const { businessId } = body;

    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId required" }, { status: 400 });
    }

    await connectDB();

    await BusinessMember.findOneAndDelete({ userId, businessId });

    return NextResponse.json({ success: true, message: "Business access removed" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
