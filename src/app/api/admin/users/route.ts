import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { connectDB } from '@/lib/mongodb';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { generateGlobalDocumentNumber } from '@/core/numbering/numberingService';
import { logAction } from "@/lib/audit/logAction";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { sendAccountCredentialsEmail } from "@/services/email/resend.service";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Role";
import { generateUniqueUserId } from "@/lib/auth/generateUserId";

// Roles any authenticated admin caller may assign. SUPER_ADMIN is
// deliberately excluded here — it's checked separately below and only
// permitted when the caller is ALREADY a super admin, so a normal admin
// can never self-escalate or mint another super admin via this route.
const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE', 'VENDOR', 'CUSTOMER', 'STAFF'];

// Dynamic imports to avoid model recompilation
async function getModels() {
  const User = mongoose.models.User || (await import('@/models/User')).default;
  const Role = mongoose.models.Role || (await import('@/models/Role')).default;
  const UserRole = mongoose.models.UserRole || (await import('@/models/UserRole')).default;
  const BusinessMember = mongoose.models.BusinessMember || (await import('@/models/BusinessMember')).default;
  const EmployeeProfile = mongoose.models.EmployeeProfile || (await import('@/models/EmployeeProfile')).default;
  const VendorProfile = mongoose.models.VendorProfile || (await import('@/models/VendorProfile')).default;
  return { User, Role, UserRole, BusinessMember, EmployeeProfile, VendorProfile };
}

export async function GET(request: NextRequest) {
  try {
    // Was auth-only (any logged-in user, any role) — this returns every
    // user's roles, employee profile, AND vendor profile data, so any
    // authenticated employee/vendor/customer account could list the full
    // user directory. Now requires USERS.VIEW specifically, same
    // permission chain as every other module (session.isSuperAdmin still
    // bypasses this via requirePermission()'s super-admin fix in
    // middleware/permission.guard.ts).
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Was an unguarded call -- a FORBIDDEN throw fell straight to this
    // route's outer catch and came back as a generic 500, not a 403, same
    // failure this route's own top comment complains about fixing for
    // GET's auth entirely. Every other route in this codebase catches this
    // specific throw to return the real status code.
    try {
      requirePermission(session as any, buildPermissionCode("users", "view"));
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();
    const { User, Role, UserRole, BusinessMember, EmployeeProfile, VendorProfile } = await getModels();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const roleFilter = searchParams.get('role') || '';
    const statusFilter = searchParams.get('status') || '';
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (statusFilter) query.status = statusFilter;

    const users = await User.find(query)
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    const total = await User.countDocuments(query);

    // Enrich with roles and profiles
    const enrichedUsers = await Promise.all(
      users.map(async (user: Record<string, unknown>) => {
        const userId = user._id as mongoose.Types.ObjectId;
        const userRoles = await UserRole.find({ userId }).populate('roleId').lean();
        const roles = userRoles.map((ur: Record<string, unknown>) => ur.roleId).filter(Boolean);

        const employeeProfile = await EmployeeProfile.findOne({
          userId,
          isDeleted: { $ne: true },
        }).lean();

        let vendorProfile = await VendorProfile.findOne({
          userId,
          isDeleted: { $ne: true },
        }).lean();

        // A user tagged into one of a vendor's 5 staff slots (see
        // /api/admin/vendor-staff-slots/[id]/activate) never gets
        // VendorProfile.userId set -- that field is 1:1 and reserved for
        // whoever can log in AS the vendor account itself, while multiple
        // staff can be tagged to the same vendor's different slots. The
        // list page's "Vendor ID" badge (admin/users/page.tsx) reads
        // vendorProfile?.vendorId though, so without this fallback a
        // successfully-tagged staff member always showed no vendor ID at
        // all -- the save "succeeded" (BusinessMember was created) but
        // nothing ever appeared to prove it.
        if (!vendorProfile) {
          const membership = await BusinessMember.findOne({
            userId,
            vendorId: { $ne: null },
            status: 'ACTIVE',
          }).lean();
          if ((membership as any)?.vendorId) {
            vendorProfile = await VendorProfile.findById((membership as any).vendorId).lean();
          }
        }

        return { ...user, roles, employeeProfile, vendorProfile };
      })
    );

    // Filter by role if specified
    let filteredUsers = enrichedUsers;
    if (roleFilter) {
      filteredUsers = enrichedUsers.filter((u) =>
        (u.roles as Array<Record<string, unknown>>).some(
          (r) => r && (r as Record<string, unknown>).code === roleFilter
        )
      );
    }

    return NextResponse.json({
      users: filteredUsers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('GET /api/admin/users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { User, Role, UserRole, BusinessMember, EmployeeProfile, VendorProfile } = await getModels();

    // This route previously only checked that SOME session existed
    // (`callerUserId` present) but never that the caller actually held any
    // admin-level permission — so any authenticated CUSTOMER/EMPLOYEE/VENDOR
    // could create ADMIN/EMPLOYEE/VENDOR/MANAGER accounts for themselves,
    // same class of privilege-escalation bug the GET handler above was
    // already fixed for (see its comment). The SUPER_ADMIN-only guard
    // further down only ever protected the SUPER_ADMIN branch specifically
    // — it did nothing to gate the route itself. Now requires the same
    // USERS.CREATE permission as every other module's create endpoint.
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("users", "create"));

    const h = await headers();
    const callerUserId = h.get('x-user-id');
    const callerIsSuperAdmin = h.get('x-is-super-admin') === 'true';
    if (!callerUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, username, password, role, businessId, employeeData, vendorData } = body;

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const requestedRole = String(role).toUpperCase();
    if (requestedRole === 'SUPER_ADMIN') {
      if (!callerIsSuperAdmin) {
        return NextResponse.json(
          { error: 'Only Super Admins can create another Super Admin user' },
          { status: 403 }
        );
      }
    } else if (!ASSIGNABLE_ROLES.includes(requestedRole)) {
      return NextResponse.json(
        { error: `role must be one of: ${['SUPER_ADMIN', ...ASSIGNABLE_ROLES].join(', ')}` },
        { status: 400 }
      );
    }

    const existingUser = await User.findOne({ email, isDeleted: { $ne: true } });
    if (existingUser) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }

    if (username) {
      const existingUsername = await User.findOne({
        username: String(username).toLowerCase().trim(),
        isDeleted: { $ne: true },
      });
      if (existingUsername) {
        return NextResponse.json({ error: 'This user ID is already taken' }, { status: 409 });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      username: username ? String(username).toLowerCase().trim() : (await generateUniqueUserId()),
      password: hashedPassword,
      // Previously never set — this route created a Role/UserRole doc in
      // the newer RBAC collections but left the User model's own legacy
      // `role` field at its schema default (CUSTOMER), which is the ONLY
      // field login/route.ts and middleware actually check for
      // isSuperAdmin / role-based access. So a user created here as
      // "ADMIN" or even "SUPER_ADMIN" would never actually get that
      // access at login time. Now set explicitly whenever the requested
      // role has a matching legacy enum value (SUPER_ADMIN/ADMIN always
      // do; EMPLOYEE/VENDOR/MANAGER/CUSTOMER fall back to the RBAC
      // Role/UserRole system below for their finer-grained permissions,
      // same as before, but at least SUPER_ADMIN/ADMIN now actually work).
      role: requestedRole === 'SUPER_ADMIN' || requestedRole === 'ADMIN' ? requestedRole : 'CUSTOMER',
      isActive: true,       // CORRECT field — User schema uses isActive not status
      isEmailVerified: false,
      authProvider: 'credentials',
      isDeleted: false,
      mustChangePassword: true,
    });

    // Was silently minting a brand-new, zero-permission Role the moment
    // anyone typed an unrecognized role string here -- that's exactly how
    // this system ended up with users holding a "role" that granted
    // nothing and was invisible in the Roles admin UI. Every assignable
    // role (ADMIN/MANAGER/EMPLOYEE/VENDOR/CUSTOMER/SUPER_ADMIN) is now
    // seeded up front (see permissionSync.service.ts's syncSuperAdminRole)
    // -- if it's missing here, that's a real configuration problem to
    // surface, not paper over.
    const roleDoc = await Role.findOne({ code: role.toUpperCase() });
    if (!roleDoc) {
      return NextResponse.json(
        { error: `Role "${role}" does not exist. Configure it in Roles & Permissions first.` },
        { status: 400 }
      );
    }

    // Create UserRole
    await UserRole.create({ userId: user._id, roleId: roleDoc._id });

    // Create BusinessMember if businessId provided
    if (businessId) {
      await BusinessMember.create({
        userId: user._id,
        businessId,
        memberType: role.toUpperCase(),
        status: 'ACTIVE',
        isDefaultBusiness: true,
      });
    }

    // Generate and create EmployeeProfile
    // employeeId/vendorId are BOTH globally unique (see EmployeeProfile.ts
    // and VendorProfile.ts) — this used to countDocuments() globally with
    // 3-digit padding and a "EMP-"/"VEN-" prefix, a THIRD and FOURTH
    // distinct format from the ones in employees/route.ts (4-digit "EMP-")
    // and vendors/route.ts, vendors/apply/route.ts, auth/register/vendor
    // /route.ts (which used "VND-", not "VEN-"). All were race-prone.
    // Consolidated onto the canonical numbering engine's global-scope
    // variant, using the same VENDOR/EMPLOYEE types (and therefore the
    // same "VND-"/"EMP-" default prefixes and shared atomic counters) as
    // every other vendor/employee creation path in the app.
    if (role === 'EMPLOYEE') {
      const { value: employeeId } = await generateGlobalDocumentNumber('EMPLOYEE', businessId || null);
      await EmployeeProfile.create({
        userId: user._id,
        businessId: businessId || new mongoose.Types.ObjectId(),
        employeeId,
        ...employeeData,
      });
    }

    // Generate and create VendorProfile
    if (role === 'VENDOR') {
      const { value: vendorId } = await generateGlobalDocumentNumber('VENDOR', businessId || null);
      await VendorProfile.create({
        userId: user._id,
        businessId: businessId || new mongoose.Types.ObjectId(),
        vendorId,
        email,
        companyName: vendorData?.companyName || name,
        ...vendorData,
      });
    }

    const createdUser = await User.findById(user._id).select('-password').lean();

    logAction({
      action: "CREATE",
      entity: "User",
      entityId: user._id?.toString(),
      after: createdUser,
      req: request,
      actor: { id: callerUserId, businessId },
    });

    // Best-effort: user creation must succeed even if the credentials email fails.
    if (password) {
      sendAccountCredentialsEmail({ to: email, name, tempPassword: password, businessId }).catch(() => {});
    }

    return NextResponse.json({ user: createdUser }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) {
      const field = error?.keyPattern ? Object.keys(error.keyPattern)[0] : 'field';
      return NextResponse.json(
        { error: field === 'username' ? 'This user ID is already taken' : `A user with this ${field} already exists` },
        { status: 409 }
      );
    }
    console.error('POST /api/admin/users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}