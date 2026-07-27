import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import BusinessMember, { BusinessMemberStatus, BusinessMemberType } from "@/models/BusinessMember";
import User from "@/models/User";
import Role from "@/models/Role";
import UserRole from "@/models/UserRole";
import { logAction } from "@/lib/audit/logAction";
import { createDefaultVendorRoles } from "@/core/access/vendorDefaultRoles.service";
import { grantVendorStaffAccess, MEMBER_TYPE_IMPLIED_MODULES } from "@/core/access/vendorAccess.service";

/**
 * Vendor-side staff management. Completes the hierarchy requested:
 * AN Group > Businesses (Tenants) > Vendors under respective businesses >
 * Warehouses under vendors > Staff.
 *
 * Any existing user can join a vendor's team as staff. They're identified
 * by their `username` (their "vendor code" — the same unique, public user
 * ID collected at signup, see auth/register/route.ts). This is deliberately
 * NOT email — a username is meant to be shareable/quotable the way a
 * "vendor code" would be, without exposing the person's email address.
 *
 * Note: the actual per-role PERMISSIONS a `vendorRole` grants (what a
 * "Warehouse Manager" vs a "Picker" can see/do inside the vendor portal)
 * are intentionally NOT enforced yet at this layer — vendorRole is stored
 * as a free-form label the vendor owner defines, and enforcing scoped UI
 * access per role is follow-up work once the vendor-portal Products/
 * Orders/BOM pages exist to actually gate.
 */

// ONE shared Owner-or-Manager definition for every vendor management
// surface -- see core/access/vendorAccess.service.ts.
import { resolveOwnerOrManagerVendor as requireVendorOwnerOrManager, resolveVendorTeamMembership } from "@/core/access/vendorAccess.service";

export async function GET() {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    // Was Owner/Manager-only -- but the vendor Calls/Jobsheets list pages
    // also call this GET just to resolve "which of my teammates' user IDs
    // do I scope my own view to" (see vendor/crm/calls/page.tsx and
    // vendor/crm/jobsheets/page.tsx's teamIds), which every team member
    // needs, not just Owner/Manager. A CCO/Engineer got a 403 here and
    // their own appointment/workorder lists silently never loaded
    // anything (teamIds stayed empty, so the fetch that depends on it
    // never ran at all). Any active team member can now read this;
    // POST below (actually adding/changing staff) stays Owner/Manager-only.
    const vendor = await requireVendorOwnerOrManager(userId) || await resolveVendorTeamMembership(userId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "You are not part of a vendor's team" }, { status: 403 });
    }

    // Self-healing resync: createDefaultVendorRoles is a cheap, idempotent
    // upsert (see that file), so re-running it here on every load keeps
    // this vendor's 11 roles' permission sets current with whatever the
    // role definitions/module-intersection logic currently say -- in
    // particular this is what actually fixes an already-onboarded
    // vendor's Owner/Manager roles after a bug in that intersection logic
    // is fixed (previously "*" resolved to zero modules whenever the
    // parent business hadn't configured Business.modules[] yet, so an
    // existing vendor's Owner could be stuck with no real permissions
    // until something re-ran this).
    if (vendor.businessId) {
      await createDefaultVendorRoles(String(vendor._id), String(vendor.businessId)).catch(() => {});
    }

    const members = await BusinessMember.find({ vendorId: vendor._id, isDeleted: { $ne: true } })
      .populate("userId", "name email username")
      .sort({ createdAt: -1 })
      .lean();

    // Same self-healing idea as the resync above, but for staff tagged
    // with a memberType (CCO/Engineer/Centre Manager) BEFORE
    // MEMBER_TYPE_IMPLIED_MODULES gained fault_codes/solutions -- their
    // personal VSTAFF_<userId> role never got those modules, and the fix
    // otherwise only applies on the next grant. grantVendorStaffAccess
    // itself REPLACES a role's permissions wholesale (not additive), so
    // this reads each member's current grant and unions the implied
    // modules into it first -- same pattern the POST handler below
    // already uses -- so an existing broader Team & Access grant is
    // never shrunk back down to just the implied set.
    if (vendor.businessId) {
      for (const m of members as any[]) {
        const implied = MEMBER_TYPE_IMPLIED_MODULES[String(m.memberType)];
        if (!implied) continue;
        const staffUserId = String(m.userId?._id || m.userId);
        const staffRoleCode = `VSTAFF_${staffUserId}`.toUpperCase();
        const existingStaffRole = await Role.findOne({
          code: staffRoleCode,
          businessId: vendor.businessId,
          vendorId: vendor._id,
        }).lean();
        const existingModules = new Set<string>(
          ((existingStaffRole as any)?.permissions || []).map((p: string) => String(p).split(".")[0].toLowerCase())
        );
        const before = existingModules.size;
        implied.forEach((mod) => existingModules.add(mod));
        if (existingModules.size === before) continue; // nothing new to add
        await grantVendorStaffAccess({
          userId: staffUserId,
          businessId: String(vendor.businessId),
          vendorId: String(vendor._id),
          modules: Array.from(existingModules),
        }).catch(() => {});
      }
    }

    // The vendor's real assignable set is the UNION of its own structural
    // roles (Owner/Manager -- vendorId: vendor._id) AND whatever
    // business-wide custom roles this business has defined from
    // Admin > Access (vendorId: null, e.g. CCO/Engineer, each with their
    // own serialized roleNumber) -- was exact-match-only on vendorId, so a
    // vendor could never assign one of the business's own custom roles to
    // their staff, only the two auto-generated structural ones. Matches
    // the same union GET /api/admin/roles?businessId&vendorId already
    // returns for the Super Admin's "Assign to Vendor" role picker --
    // reported live: a business's serialized custom roles (CCO, Engineer,
    // Manager) weren't listed here at all, only Owner/Manager.
    const roles = await Role.find({
      businessId: vendor.businessId,
      status: "ACTIVE",
      $or: [{ vendorId: vendor._id }, { vendorId: null }],
    })
      .select("code name description roleNumber")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      staff: members,
      roles,
      // So the staff-creation UI can show only the memberType roles
      // relevant to which facilities this vendor actually has enabled
      // (Store Front/Service Center → CCO/ENGINEER/CENTRE_MANAGER,
      // Warehouse → HELPER/PACKER/SCM — see BusinessMember.ts).
      vendor: {
        enableStoreFront: !!(vendor as any).enableStoreFront,
        enableServiceCenter: !!(vendor as any).enableServiceCenter,
        enableWarehouse: !!(vendor as any).enableWarehouse,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/** Body: { username: string, vendorRole: string, memberType?: string, roleCode?: string }
 *
 * roleCode (optional) is the ACTUAL permission grant: one of this vendor's
 * own fixed default roles (VENDOR_OWNER/VENDOR_MANAGER/etc., generated at
 * approval time -- see core/access/vendorDefaultRoles.service.ts). The
 * lookup is deliberately scoped to {businessId: vendor.businessId, vendorId:
 * vendor._id} -- never a global Role.findOne({code}) -- so a vendor can
 * only ever hand out roles from its own generated 11, never invent a new
 * one or reach another vendor's roles. vendorRole above stays a free-text
 * display label; roleCode is what actually grants access. */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const vendor = await requireVendorOwnerOrManager(userId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Only a vendor's Owner or Manager can add its own staff" }, { status: 403 });
    }
    if (!vendor.businessId) {
      return NextResponse.json({ success: false, error: "Vendor is not yet assigned to a business" }, { status: 400 });
    }

    const body = await req.json();
    const { username, vendorRole, memberType, roleCode } = body;
    if (!username || !String(username).trim()) {
      return NextResponse.json({ success: false, error: "The staff member's user ID (vendor code) is required" }, { status: 400 });
    }
    if (!vendorRole || !String(vendorRole).trim()) {
      return NextResponse.json({ success: false, error: "A role must be assigned to this staff member" }, { status: 400 });
    }

    const targetUser = await User.findOne({
      username: String(username).toLowerCase().trim(),
      isDeleted: { $ne: true },
    }).lean();
    if (!targetUser) {
      return NextResponse.json({ success: false, error: "No user found with that ID" }, { status: 404 });
    }

    // Must already be Super-Admin-attached to this vendor's team before a
    // role can be granted -- the vendor can hand out access, it can't pull
    // someone onto its team unilaterally (that's Super Admin's call via
    // /api/admin/users/[id]/promote).
    const existingMembership = await BusinessMember.findOne({
      userId: (targetUser as any)._id,
      businessId: vendor.businessId,
      vendorId: vendor._id,
      isDeleted: { $ne: true },
    }).lean();
    if (roleCode && !existingMembership) {
      return NextResponse.json(
        { success: false, error: "This user must be attached to your team by Super Admin before a role can be granted" },
        { status: 403 }
      );
    }

    let grantedRoleDoc = null;
    if (roleCode) {
      // Same union as the GET above -- this vendor's own structural roles
      // OR one of the business's own custom roles (vendorId: null).
      grantedRoleDoc = await Role.findOne({
        code: String(roleCode).toUpperCase(),
        businessId: vendor.businessId,
        $or: [{ vendorId: vendor._id }, { vendorId: null }],
      });
      if (!grantedRoleDoc) {
        return NextResponse.json(
          { success: false, error: "That role does not belong to your vendor or this business" },
          { status: 400 }
        );
      }
    }

    // Store Front/Service Center staff roles and Warehouse staff roles,
    // in addition to the legacy VENDOR_* prefixed types — see
    // BusinessMember.ts's memberType enum.
    const ALLOWED_STAFF_MEMBER_TYPES: string[] = [
      "CCO", "ENGINEER", "CENTRE_MANAGER", "HELPER", "PACKER", "SCM",
    ];
    const isAllowedMemberType =
      memberType &&
      (String(memberType).startsWith("VENDOR") || ALLOWED_STAFF_MEMBER_TYPES.includes(String(memberType)));

    // A staff member can hold more than one role (e.g. Manager + Finance
    // Manager, or several people all holding "CCO") -- BusinessMember has
    // one doc per (user, business, vendor), so a second role grant for the
    // same person appends its label to vendorRole's display instead of
    // overwriting the first one. The actual access grant is additive
    // regardless (separate UserRole rows below), this is just display text.
    const newRoleLabel = String(vendorRole).trim();
    const existingLabel = (existingMembership as any)?.vendorRole as string | undefined;
    const combinedLabel =
      existingLabel && !existingLabel.split(", ").includes(newRoleLabel)
        ? `${existingLabel}, ${newRoleLabel}`
        : existingLabel || newRoleLabel;

    const member = await BusinessMember.findOneAndUpdate(
      { userId: targetUser._id, businessId: vendor.businessId, vendorId: vendor._id },
      {
        $set: {
          status: BusinessMemberStatus.ACTIVE,
          memberType: (isAllowedMemberType ? memberType : "VENDOR_HELPER") as BusinessMemberType,
          vendorRole: combinedLabel,
          invitedBy: userId,
          isDeleted: false,
        },
        $setOnInsert: { joinedAt: new Date(), isDefaultBusiness: false },
      },
      { upsert: true, new: true }
    );

    if (grantedRoleDoc) {
      await UserRole.updateOne(
        { userId: (targetUser as any)._id, roleId: grantedRoleDoc._id },
        {
          $setOnInsert: {
            userId: (targetUser as any)._id,
            roleId: grantedRoleDoc._id,
            businessId: vendor.businessId,
            assignedBy: userId,
          },
        },
        { upsert: true }
      );
      // Real access granted -> the registration floor (shopnative view)
      // is removed; the user retains exactly what was added, and the DB
      // reflects it for the next login's routing.
      const { stripFloorRoles } = await import("@/core/access/floorRoles.service");
      await stripFloorRoles(String((targetUser as any)._id));
    }

    // `memberType: "ENGINEER"` was purely a display label -- tagging
    // someone Engineer here never actually granted them CRM_JOBSHEETS.EDIT,
    // which is the ONE permission /api/crm/jobsheets/[id]/engineers filters
    // on. A vendor Owner naturally expects "add staff as Engineer" alone to
    // be sufficient (it visually implies real access), but the only place
    // that ever granted that permission was the separate Team & Access
    // module-checkbox screen -- so an Engineer added only from here never
    // showed up in the job-sheet assignment dropdown. Auto-grant the
    // modules an Engineer needs, additively (union with whatever Team &
    // Access already granted this person) so this call never clobbers a
    // broader grant made from that other screen.
    const impliedModules = MEMBER_TYPE_IMPLIED_MODULES[String(member.memberType)];
    if (impliedModules) {
      const staffRoleCode = `VSTAFF_${(targetUser as any)._id}`.toUpperCase();
      const existingStaffRole = await Role.findOne({
        code: staffRoleCode,
        businessId: vendor.businessId,
        vendorId: vendor._id,
      }).lean();
      const existingModules = new Set<string>(
        ((existingStaffRole as any)?.permissions || []).map((p: string) => String(p).split(".")[0].toLowerCase())
      );
      impliedModules.forEach((m) => existingModules.add(m));
      await grantVendorStaffAccess({
        userId: String((targetUser as any)._id),
        businessId: String(vendor.businessId),
        vendorId: String(vendor._id),
        modules: Array.from(existingModules),
        grantedBy: userId || undefined,
      });
    }

    logAction({
      action: "CREATE",
      entity: "BusinessMember",
      entityId: member._id?.toString(),
      after: { userId: targetUser._id, vendorId: vendor._id, vendorRole },
      req,
      actor: { id: userId, businessId: vendor.businessId?.toString() },
    });

    return NextResponse.json({ success: true, staff: member });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
