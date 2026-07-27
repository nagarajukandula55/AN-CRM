/**
 * GET/PATCH /api/vendor/team — the vendor Owner/Manager's Team & Access
 * surface, backing the "Team & Access" section on the vendor profile page.
 *
 * GET returns every user attached to this vendor (attached by Super Admin
 * via Admin > Users, or by the vendor themselves), each with their current
 * per-module access grants + whether they hold the Manager role, plus the
 * list of modules AVAILABLE to grant (this vendor's business's enabled
 * module selection intersected with the vendor-operational module set —
 * see vendorAccess.service.ts).
 *
 * PATCH { userId, modules: string[], isManager?: boolean } sets that
 * user's access to exactly the given set — one module or many ("single
 * access to user or multiple access"). Empty array revokes everything.
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import BusinessMember from "@/models/BusinessMember";
import { logAction } from "@/lib/audit/logAction";
import {
  resolveOwnerOrManagerVendor,
  getVendorAvailableModules,
  getVendorStaffAccessMap,
  grantVendorStaffAccess,
} from "@/core/access/vendorAccess.service";

export async function GET() {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const vendor = await resolveOwnerOrManagerVendor(userId);
    if (!vendor) {
      return NextResponse.json(
        { success: false, error: "Only a vendor's Owner or Manager can manage team access" },
        { status: 403 }
      );
    }
    const businessId = String((vendor as any).businessId || "");
    if (!businessId) {
      return NextResponse.json({ success: false, error: "Vendor is not yet assigned to a business" }, { status: 400 });
    }

    const [members, availableModules, accessMap] = await Promise.all([
      BusinessMember.find({ vendorId: (vendor as any)._id, status: "ACTIVE", isDeleted: { $ne: true } })
        .populate("userId", "name email username")
        .sort({ createdAt: -1 })
        .lean(),
      getVendorAvailableModules(businessId),
      getVendorStaffAccessMap(String((vendor as any)._id), businessId),
    ]);

    const ownerUserId = String((vendor as any).userId || "");

    const team = (members as any[])
      .filter((m) => m.userId)
      .map((m) => {
        const uid = String(m.userId._id).toLowerCase();
        const access = accessMap[uid] || { modules: [], isManager: false };
        return {
          userId: String(m.userId._id),
          name: m.userId.name,
          email: m.userId.email,
          username: m.userId.username,
          isOwner: String(m.userId._id) === ownerUserId,
          isManager: access.isManager,
          modules: access.modules,
        };
      });

    return NextResponse.json({
      success: true,
      team,
      availableModules: availableModules.map((m) => ({ key: m.key, label: m.label, description: m.description })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const callerId = h.get("x-user-id");
    const vendor = await resolveOwnerOrManagerVendor(callerId);
    if (!vendor) {
      return NextResponse.json(
        { success: false, error: "Only a vendor's Owner or Manager can manage team access" },
        { status: 403 }
      );
    }
    const businessId = String((vendor as any).businessId || "");
    if (!businessId) {
      return NextResponse.json({ success: false, error: "Vendor is not yet assigned to a business" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { userId, modules, isManager } = body || {};
    if (!userId || !Array.isArray(modules)) {
      return NextResponse.json(
        { success: false, error: "userId and modules (array of module keys) are required" },
        { status: 400 }
      );
    }

    // The target must actually be attached to THIS vendor's team — access
    // can never be handed to an arbitrary user id.
    const membership = await BusinessMember.findOne({
      userId,
      vendorId: (vendor as any)._id,
      status: "ACTIVE",
      isDeleted: { $ne: true },
    }).lean();
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "That user is not attached to your vendor team" },
        { status: 404 }
      );
    }

    // The structural Owner's access can't be edited away from under them.
    if (String((vendor as any).userId || "") === String(userId)) {
      return NextResponse.json(
        { success: false, error: "The vendor Owner's access is structural and cannot be edited" },
        { status: 400 }
      );
    }

    await grantVendorStaffAccess({
      userId: String(userId),
      businessId,
      vendorId: String((vendor as any)._id),
      modules: modules.map((m: unknown) => String(m)),
      isManager: typeof isManager === "boolean" ? isManager : undefined,
      grantedBy: callerId || undefined,
    });

    logAction({
      action: "UPDATE",
      entity: "VendorStaffAccess",
      entityId: String(userId),
      after: { vendorId: String((vendor as any)._id), modules, isManager },
      req,
      actor: { id: callerId || undefined, businessId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
