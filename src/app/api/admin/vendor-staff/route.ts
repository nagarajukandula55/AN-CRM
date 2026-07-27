import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import VendorProfile from "@/models/VendorProfile";
import BusinessMember, { BusinessMemberStatus } from "@/models/BusinessMember";
import User from "@/models/User";
import { logAction } from "@/lib/audit/logAction";

/**
 * List current staff for a vendor — used by the vendor detail page so
 * admins can see who actually has access, not just add new people blind.
 * Query: ?vendorId=<VendorProfile._id>
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const callerUserId = h.get("x-user-id");
    if (!callerUserId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const vendorId = req.nextUrl.searchParams.get("vendorId");
    if (!vendorId) {
      return NextResponse.json({ success: false, error: "vendorId is required" }, { status: 400 });
    }

    const staff = await BusinessMember.find({
      vendorId,
      isDeleted: { $ne: true },
    })
      .populate("userId", "name email username")
      .sort({ createdAt: 1 })
      .lean();

    return NextResponse.json({ success: true, staff });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * Super-admin equivalent of /api/vendor/staff — lets a super admin attach
 * ANY user to ANY vendor as staff, for support/override cases (per the
 * user's explicit answer: "super admin can add anybody to any vendor").
 * Regular admins are not granted this — it's deliberately restricted to
 * super admin, same as Super Admin creation in /api/admin/users.
 *
 * Body: { username: string, vendorId: string, vendorRole: string, memberType?: string }
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const callerUserId = h.get("x-user-id");
    const callerIsSuperAdmin = h.get("x-is-super-admin") === "true";
    if (!callerUserId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!callerIsSuperAdmin) {
      return NextResponse.json({ success: false, error: "Only Super Admins can assign staff to any vendor" }, { status: 403 });
    }

    const body = await req.json();
    const { username, vendorId, vendorRole, memberType } = body;
    if (!username || !String(username).trim()) {
      return NextResponse.json({ success: false, error: "The staff member's user ID is required" }, { status: 400 });
    }
    if (!vendorId) {
      return NextResponse.json({ success: false, error: "vendorId is required" }, { status: 400 });
    }
    if (!vendorRole || !String(vendorRole).trim()) {
      return NextResponse.json({ success: false, error: "A role must be assigned to this staff member" }, { status: 400 });
    }

    const vendor = await VendorProfile.findOne({ _id: vendorId, isDeleted: { $ne: true } }).lean();
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
    }
    if (!vendor.businessId) {
      return NextResponse.json({ success: false, error: "This vendor is not yet assigned to a business — approve it first" }, { status: 400 });
    }

    const targetUser = await User.findOne({
      username: String(username).toLowerCase().trim(),
      isDeleted: { $ne: true },
    }).lean();
    if (!targetUser) {
      return NextResponse.json({ success: false, error: "No user found with that ID" }, { status: 404 });
    }

    const member = await BusinessMember.findOneAndUpdate(
      { userId: targetUser._id, businessId: vendor.businessId, vendorId: vendor._id },
      {
        $set: {
          status: BusinessMemberStatus.ACTIVE,
          memberType: memberType && String(memberType).startsWith("VENDOR") ? memberType : "VENDOR_HELPER",
          vendorRole: String(vendorRole).trim(),
          invitedBy: callerUserId,
          isDeleted: false,
        },
        $setOnInsert: { joinedAt: new Date(), isDefaultBusiness: false },
      },
      { upsert: true, new: true }
    );

    logAction({
      action: "CREATE",
      entity: "BusinessMember",
      entityId: member._id?.toString(),
      after: { userId: targetUser._id, vendorId: vendor._id, vendorRole },
      req,
      actor: { id: callerUserId, businessId: vendor.businessId?.toString() },
    });

    return NextResponse.json({ success: true, staff: member });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
