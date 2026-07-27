import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import { getEnrichedSession } from '@/lib/auth/session-enriched';
import { logAction } from '@/lib/audit/logAction';
import User from '@/models/User';
import Role from '@/models/Role';
import UserRole from '@/models/UserRole';
import BusinessMember, { BusinessMemberStatus } from '@/models/BusinessMember';
import VendorProfile from '@/models/VendorProfile';
import { stripFloorRoles } from '@/core/access/floorRoles.service';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/[id]/promote — the ONLY way a user's floor access
 * (CUSTOMER_SHOPNATIVE / CUSTOMER_ANGROUP / any other minimal role) gets
 * elevated. Super-Admin-only (checked via session.isSuperAdmin directly,
 * not just a permission code, since no other actor may ever call this).
 *
 * Floor handling (per explicit direction): granting a REAL role here
 * REMOVES the registration floor (shopnative view) -- the user retains
 * exactly the access that was added, and the DB reflects it immediately
 * so the next login routes them to the right UI instead of the
 * storefront.
 *
 * body: { track: 'AN_EMPLOYEE' | 'VENDOR_TEAM', roleCode?, businessId?, vendorId? }
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Only Super Admin can promote a user out of base access' },
        { status: 403 }
      );
    }

    await connectDB();
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid user ID' }, { status: 400 });
    }

    const targetUser = await User.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const body = await req.json();
    const { track, roleCode, businessId, vendorId } = body;

    if (track === 'AN_EMPLOYEE') {
      const requested = String(roleCode || '').toUpperCase();
      if (!['SUPER_ADMIN', 'AN_STAFF'].includes(requested)) {
        return NextResponse.json(
          { success: false, error: 'roleCode must be SUPER_ADMIN or AN_STAFF for the AN_EMPLOYEE track' },
          { status: 400 }
        );
      }
      // Granting SUPER_ADMIN itself requires the caller already be one --
      // already enforced above (this whole route is super-admin-only), but
      // kept explicit since it's the highest-consequence grant here.

      let roleDoc = await Role.findOne({ code: requested, businessId: null, vendorId: null });
      if (!roleDoc && requested === 'AN_STAFF') {
        // Structural role -- self-heals the same way the rebuild endpoint
        // seeds it (view+export on every module, platform-wide), so this
        // track never dead-ends on a fresh database.
        const { ALL_MODULE_KEYS } = await import('@/core/access/moduleHierarchy');
        const { buildPermissionCode } = await import('@/core/access/actions');
        roleDoc = await Role.create({
          code: 'AN_STAFF',
          businessId: null,
          vendorId: null,
          name: 'AN Group Staff',
          description: "AN Group's own staff — sees all data across every business (view/export everywhere).",
          permissions: ALL_MODULE_KEYS.flatMap((m: string) => [
            buildPermissionCode(m, 'view'),
            buildPermissionCode(m, 'export'),
          ]),
          isSystem: true,
          isProtected: true,
        });
      }
      if (!roleDoc) {
        return NextResponse.json(
          { success: false, error: `Role "${requested}" is not configured.` },
          { status: 400 }
        );
      }

      await UserRole.updateOne(
        { userId: targetUser._id, roleId: roleDoc._id },
        { $setOnInsert: { userId: targetUser._id, roleId: roleDoc._id } },
        { upsert: true }
      );

      if (requested === 'SUPER_ADMIN') {
        targetUser.role = 'SUPER_ADMIN' as any;
      } else if (targetUser.role === 'CUSTOMER') {
        targetUser.role = 'ADMIN' as any;
      }
      await targetUser.save();
      await stripFloorRoles(String(targetUser._id));

      logAction({
        action: 'UPDATE',
        entity: 'User',
        entityId: id,
        after: { promoted: 'AN_EMPLOYEE', roleCode: requested },
        req,
        actor: { id: session.user.id },
      });

      return NextResponse.json({ success: true, message: `Promoted to ${requested}` });
    }

    if (track === 'VENDOR_TEAM') {
      if (!businessId || !mongoose.Types.ObjectId.isValid(businessId)) {
        return NextResponse.json({ success: false, error: 'businessId is required' }, { status: 400 });
      }
      if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
        return NextResponse.json({ success: false, error: 'vendorId is required' }, { status: 400 });
      }
      // roleCode is deliberately OPTIONAL again, per explicit direction:
      // Super Admin's job here is just attaching a user to a vendor's
      // team -- deciding what access that person actually gets is the
      // vendor's own responsibility from their Team/Profile page, not
      // something Super Admin needs to configure in the same step. A
      // roleCode can still be passed to grant one in the same call as a
      // convenience, but it's no longer required.
      const vendor = await VendorProfile.findOne({
        _id: vendorId,
        businessId,
        isDeleted: { $ne: true },
      }).lean<any>();
      if (!vendor) {
        return NextResponse.json(
          { success: false, error: 'Vendor not found under this business' },
          { status: 404 }
        );
      }
      if (vendor.status !== 'ACTIVE') {
        return NextResponse.json(
          { success: false, error: 'Vendor is not active yet' },
          { status: 400 }
        );
      }

      // A brand-new user has no OTHER membership to have already picked as
      // default, so leaving isDefaultBusiness false here (as this used to)
      // left them with NO business context at all -- getBusinessContext()'s
      // fallback only ever looks for isDefaultBusiness: true, finds
      // nothing, and every business-scoped role (their granted
      // VENDOR_MANAGER/MANAGER role included) then silently drops out of
      // session-enriched.ts's permission resolution, which requires a real
      // active business to keep a role scoped to one. Reproduced against
      // production: manager@vendor.com was attached this way and had zero
      // active business context, 403ing on every business-scoped page
      // despite holding the right role.
      const hasAnyMembership = await BusinessMember.exists({ userId: targetUser._id, isDeleted: { $ne: true } });

      // A user is on exactly one vendor's team at a time -- deactivating any
      // OTHER vendor-team membership here (not just leaving it and hoping
      // nothing reads it) is what actually prevents the class of bug where a
      // stale/earlier membership silently wins resolution over the one just
      // assigned (see resolveVendorContext / login's activeBusinessId pick).
      await BusinessMember.updateMany(
        { userId: targetUser._id, vendorId: { $ne: null, $nin: [vendorId] }, isDeleted: { $ne: true } },
        { $set: { status: 'INACTIVE', isDeleted: true } }
      );

      // Additive: attach the user to this vendor's team so they become
      // visible on the vendor's own team-management screen.
      await BusinessMember.updateOne(
        { userId: targetUser._id, businessId, vendorId },
        {
          $set: { status: BusinessMemberStatus.ACTIVE },
          $setOnInsert: {
            userId: targetUser._id,
            businessId,
            vendorId,
            memberType: 'VENDOR',
            isDefaultBusiness: !hasAnyMembership,
          },
        },
        { upsert: true }
      );

      // Super Admin can also directly grant a role here now (originally
      // this track only attached the user, leaving them with zero
      // permissions until the vendor separately granted one via
      // /api/vendor/staff -- in practice that left people attached but
      // stuck with no access for a while, or forgotten entirely). Scoped
      // the exact same way the vendor's own grant flow scopes it
      // ({businessId, vendorId}) so Super Admin can only hand out this
      // vendor's own generated role set, never invent one or reach
      // another vendor's roles.
      let grantedRoleCode: string | null = null;
      if (roleCode) {
        // Accepts either this vendor's own generated role (vendorId set)
        // OR a business-wide custom role built for this business from
        // Admin > Access (vendorId unset) -- matches the same broadened
        // set GET /api/admin/roles?businessId&vendorId now returns, so
        // whatever role the picker offered here actually validates.
        const grantedRoleDoc = await Role.findOne({
          code: String(roleCode).toUpperCase(),
          businessId,
          $or: [{ vendorId }, { vendorId: { $in: [null, undefined] } }],
        });
        if (!grantedRoleDoc) {
          return NextResponse.json(
            { success: false, error: 'That role does not belong to this vendor or business' },
            { status: 400 }
          );
        }
        await UserRole.updateOne(
          { userId: targetUser._id, roleId: grantedRoleDoc._id },
          {
            $setOnInsert: {
              userId: targetUser._id,
              roleId: grantedRoleDoc._id,
              businessId,
              assignedBy: session.user.id,
            },
          },
          { upsert: true }
        );
        grantedRoleCode = grantedRoleDoc.code;
        await stripFloorRoles(String(targetUser._id));
      }

      logAction({
        action: 'UPDATE',
        entity: 'User',
        entityId: id,
        after: { promoted: 'VENDOR_TEAM', businessId, vendorId, roleCode: grantedRoleCode },
        req,
        actor: { id: session.user.id },
      });

      return NextResponse.json({
        success: true,
        message: grantedRoleCode ? `Attached to vendor team and granted ${grantedRoleCode}` : 'Attached to vendor team',
      });
    }

    return NextResponse.json(
      { success: false, error: 'track must be AN_EMPLOYEE or VENDOR_TEAM' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('POST /api/admin/users/[id]/promote error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
