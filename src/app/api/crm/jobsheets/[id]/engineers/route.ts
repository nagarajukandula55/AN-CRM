/**
 * GET /api/crm/jobsheets/[id]/engineers — lists engineers eligible to be
 * assigned to this job sheet's business, for the "Assign engineer"
 * picker on the job sheet detail page.
 *
 * This used to call /api/vendor/staff (the vendor PORTAL's own team-
 * management endpoint, gated to that vendor's literal Owner account only)
 * and filter the result by BusinessMember.vendorRole === 'ENGINEER' -- a
 * free-text display label the vendor Owner types in when granting access,
 * not a reliable machine-checkable field (see resolveOwnerOrManagerVendor
 * in api/vendor/settings/route.ts for the same anti-pattern already
 * avoided there). Two bugs followed: (1) anyone opening this page who
 * wasn't literally the vendor's Owner got a 403 and silently saw an empty
 * list, and (2) even the Owner only ever matched a member whose typed
 * label was the exact string "ENGINEER". Job sheets are business-scoped
 * (CrmJobSheet has no vendorId of its own), so this now checks the real
 * granted workorder access across every vendor under this job sheet's
 * business, gated by the caller's own crm_jobsheets permission instead of
 * "are you this one vendor's Owner".
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CrmJobSheet from "@/models/CrmJobSheet";
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";
import BusinessMember from "@/models/BusinessMember";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("crm_jobsheets", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid job sheet id" }, { status: 400 });
    }

    await connectDB();
    const jobSheet = await CrmJobSheet.findById(id).select("businessId").lean();
    if (!jobSheet) {
      return NextResponse.json({ success: false, message: "Job sheet not found" }, { status: 404 });
    }
    const businessId = (jobSheet as any).businessId;

    // Users are vendor-scoped even when the ROLE that grants them access is
    // business-wide -- a CCO/Manager should only ever see and assign their
    // OWN vendor's engineers, never pool every vendor under this business
    // together. Resolve the caller's own vendorId from their membership; a
    // genuine business-wide caller (no vendorId at all, e.g. AN Group
    // staff) keeps seeing everyone, since they're not scoped to one vendor.
    const callerMembership = await BusinessMember.findOne({
      userId: session.user.id,
      businessId,
      vendorId: { $ne: null },
      status: "ACTIVE",
      isDeleted: { $ne: true },
    })
      .select("vendorId")
      .lean();
    const callerVendorId = (callerMembership as any)?.vendorId || null;

    // Per explicit direction: this picker is for assigning the actual
    // repair work, so it must only list people holding an "Engineer"
    // designation -- not everyone who merely has CRM_JOBSHEETS.EDIT
    // (CCO/Manager/Owner also carry that permission for oversight, but
    // aren't who a job gets assigned TO). Matches any role literally coded
    // ENGINEER, whether business-wide (Admin > Access) or vendor-scoped.
    const engineerRoles = await Role.find({
      businessId,
      code: "ENGINEER",
      permissions: buildPermissionCode("crm_jobsheets", "edit"),
    })
      .select("_id")
      .lean();
    if (engineerRoles.length === 0) {
      return NextResponse.json({ success: true, engineers: [] });
    }

    const engineerUserRoles = await UserRole.find({ roleId: { $in: engineerRoles.map((r: any) => r._id) } })
      .select("userId")
      .lean();
    const engineerUserIds = Array.from(new Set(engineerUserRoles.map((ur: any) => String(ur.userId))));
    if (engineerUserIds.length === 0) {
      return NextResponse.json({ success: true, engineers: [] });
    }

    const members = await BusinessMember.find({
      userId: { $in: engineerUserIds },
      businessId,
      status: "ACTIVE",
      isDeleted: { $ne: true },
      ...(callerVendorId ? { vendorId: callerVendorId } : {}),
    })
      .populate("userId", "name email username")
      .lean();

    const engineers = members
      .filter((m: any) => m.userId)
      .map((m: any) => ({
        _id: m.userId._id,
        name: m.userId.name,
        email: m.userId.email,
        username: m.userId.username,
        vendorId: m.vendorId,
      }));

    return NextResponse.json({ success: true, engineers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
