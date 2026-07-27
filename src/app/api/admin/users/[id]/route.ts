import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission, requireAnyPermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Role";
import "@/models/User";

const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE', 'VENDOR', 'CUSTOMER'];

// Floor/registration-default role codes (see auth/register/route.ts,
// auth/login/route.ts's MINIMAL_FLOOR_ROLE_CODES) that every user keeps
// forever by design (promote/route.ts's "never leave someone with zero
// roles" invariant) -- but that means whichever role got inserted first
// (almost always this floor role, created at signup) used to always win
// `roles[0]` on the frontend (admin/users/[id]/page.tsx's primaryRole),
// so an employee who was later assigned a real role still showed
// "Customer" as their displayed role/badge. Sorting these to the end
// fixes the display without touching the underlying additive-roles
// design (a user legitimately keeps both).
const FLOOR_ROLE_CODES = new Set(["CUSTOMER", "CUSTOMER_ANGROUP", "CUSTOMER_SHOPNATIVE"]);

function sortRolesFloorLast(roles: any[]): any[] {
  return [...roles].sort((a, b) => {
    const aFloor = FLOOR_ROLE_CODES.has(a?.code) ? 1 : 0;
    const bFloor = FLOOR_ROLE_CODES.has(b?.code) ? 1 : 0;
    return aFloor - bFloor;
  });
}

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

async function getModels() {
  const User = mongoose.models.User || (await import('@/models/User')).default;
  const Role = mongoose.models.Role || (await import('@/models/Role')).default;
  const UserRole = mongoose.models.UserRole || (await import('@/models/UserRole')).default;
  const EmployeeProfile = mongoose.models.EmployeeProfile || (await import('@/models/EmployeeProfile')).default;
  const VendorProfile = mongoose.models.VendorProfile || (await import('@/models/VendorProfile')).default;
  const BusinessMember = mongoose.models.BusinessMember || (await import('@/models/BusinessMember')).default;
  return { User, Role, UserRole, EmployeeProfile, VendorProfile, BusinessMember };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      // Also accepts employees.edit -- a Manager granted full Employees
      // access needs to see their own employee's current roles to manage
      // access from the Employees page, without needing the separate
      // Users module grant too.
      requireAnyPermission(session as any, [
        buildPermissionCode("users", "view"),
        buildPermissionCode("employees", "edit"),
      ]);
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    await connectDB();
    const { id } = await params;
    const { User, UserRole, EmployeeProfile, VendorProfile, BusinessMember } = await getModels();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const user = await User.findOne({ _id: id, isDeleted: { $ne: true } })
      .select('-password')
      .lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userRoles = await UserRole.find({ userId: id }).populate('roleId').lean();
    const roles = sortRolesFloorLast(userRoles.map((ur: Record<string, unknown>) => ur.roleId).filter(Boolean));

    const employeeProfile = await EmployeeProfile.findOne({
      userId: id,
      isDeleted: { $ne: true },
    })
      .populate('reportingTo', 'name email')
      .lean();

    let vendorProfile = await VendorProfile.findOne({
      userId: id,
      isDeleted: { $ne: true },
    }).lean();

    // Same fallback as GET /api/admin/users -- a user tagged into a
    // vendor's staff slot only gets a BusinessMember row, not
    // VendorProfile.userId (that field is 1:1, reserved for the vendor's
    // own login). Without this, re-opening the edit panel for an
    // already-tagged staff member showed no vendor ID at all.
    if (!vendorProfile) {
      const membership = await BusinessMember.findOne({
        userId: id,
        vendorId: { $ne: null },
        status: 'ACTIVE',
      }).lean();
      if ((membership as any)?.vendorId) {
        vendorProfile = await VendorProfile.findById((membership as any).vendorId).lean();
      }
    }

    return NextResponse.json({ user: { ...user, roles, employeeProfile, vendorProfile } });
  } catch (error) {
    console.error('GET /api/admin/users/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("users", "edit"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    await connectDB();
    const { id } = await params;
    const { User, Role, UserRole, EmployeeProfile, VendorProfile, BusinessMember } = await getModels();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name, email, password, status, isActive, role, employeeData, vendorData, businessId } = body;

    // Was letting `role` be set to ANY string (including SUPER_ADMIN) with
    // no escalation guard -- same anti-escalation rule as api/admin/users
    // POST and api/staff/create now applies here too.
    if (role) {
      const requestedRole = String(role).toUpperCase();
      if (requestedRole === 'SUPER_ADMIN' && !session.isSuperAdmin) {
        return NextResponse.json(
          { error: 'Only Super Admins can grant the Super Admin role' },
          { status: 403 }
        );
      }
      if (requestedRole !== 'SUPER_ADMIN' && !ASSIGNABLE_ROLES.includes(requestedRole)) {
        return NextResponse.json(
          { error: `role must be one of: ${['SUPER_ADMIN', ...ASSIGNABLE_ROLES].join(', ')}` },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name)     updateData.name = name;
    if (email)    updateData.email = email;
    if (password) updateData.password = await bcrypt.hash(password, 12);
    // The flat legacy User.role field is what actually drives
    // x-is-super-admin at login (see api/admin/users/route.ts's own
    // comment on this) -- was never actually updated here, only the
    // Role/UserRole join rows below, so changing a user's role through
    // this route silently never took effect at login time.
    if (role) {
      const requestedRole = String(role).toUpperCase();
      updateData.role = requestedRole === 'SUPER_ADMIN' || requestedRole === 'ADMIN' ? requestedRole : 'CUSTOMER';
    }

    // Handle status toggle — User schema uses `isActive` (boolean), not `status` (string)
    if (typeof isActive === 'boolean') {
      updateData.isActive = isActive;
    } else if (status === 'ACTIVE') {
      updateData.isActive = true;
    } else if (status === 'INACTIVE') {
      updateData.isActive = false;
    }

    const user = await User.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { $set: updateData },
      { new: true }
    ).select('-password');

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update role if provided. Under the rebuilt access architecture there
    // are no seeded default roles (ADMIN/MANAGER/EMPLOYEE/... only exist if
    // the Super Admin created them) -- so a missing Role doc here is now a
    // SKIP, not a hard 400: the rest of the edit (name/email/status) still
    // saves, and real access is managed from Admin > Access / the vendor's
    // Team & Access instead of this legacy flat field.
    let roleWarning: string | undefined;
    if (role) {
      const roleDoc = await Role.findOne({ code: role.toUpperCase() });
      if (roleDoc) {
        // Replace existing user role
        await UserRole.deleteMany({ userId: id });
        await UserRole.create({ userId: id, roleId: roleDoc._id });
      } else {
        roleWarning = `Role "${role}" does not exist — user saved, but no role was assigned. Create roles in Admin > Access.`;
      }
    }

    // Assign to a business -- this is the "tag an existing user to a
    // business/vendor" half of provisioning; upsert rather than create so
    // re-assigning (or re-running this call) doesn't produce duplicate
    // memberships for the same user+business.
    if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
      await BusinessMember.findOneAndUpdate(
        { userId: id, businessId },
        { $set: { memberType: (role || 'EMPLOYEE').toUpperCase(), status: 'ACTIVE' } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    // Update employee profile if provided
    if (employeeData) {
      await EmployeeProfile.findOneAndUpdate(
        { userId: id },
        { $set: employeeData },
        { new: true, upsert: false }
      );
    }

    // Update vendor profile if provided
    if (vendorData) {
      await VendorProfile.findOneAndUpdate(
        { userId: id },
        { $set: vendorData },
        { new: true, upsert: false }
      );
    }

    // Re-fetch enriched user
    const userRoles = await UserRole.find({ userId: id }).populate('roleId').lean();
    const roles = sortRolesFloorLast(userRoles.map((ur: Record<string, unknown>) => ur.roleId).filter(Boolean));

    logAction({
      action: "UPDATE",
      entity: "User",
      entityId: id,
      after: updateData,
      req: request,
    });

    return NextResponse.json({ user: { ...user.toObject(), roles } });
  } catch (error) {
    console.error('PUT /api/admin/users/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("users", "delete"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    await connectDB();
    const { id } = await params;
    const { User } = await getModels();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const user = await User.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, isActive: false } },
      { new: true }
    ).select('-password');

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logAction({
      action: "DELETE",
      entity: "User",
      entityId: id,
      req: request,
    });

    return NextResponse.json({ message: 'User deleted successfully', user });
  } catch (error) {
    console.error('DELETE /api/admin/users/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
