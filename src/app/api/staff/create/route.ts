import { NextResponse } from 'next/server'

import bcrypt from 'bcryptjs'

import { connectDB } from '@/lib/mongodb'

import User from '@/models/User'
import Role from '@/models/Role'
import UserRole from '@/models/UserRole'

import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { sendAccountCredentialsEmail } from "@/services/email/resend.service";
import { generateUniqueUserId } from '@/lib/auth/generateUserId'

// Same anti-escalation allow-list as api/admin/users/route.ts's POST --
// SUPER_ADMIN is deliberately excluded and checked separately below.
const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE', 'VENDOR', 'CUSTOMER'];

/**
 * POST /api/staff/create — previously had NO auth check at all, and wrote
 * client-supplied `body.role` and `body.permissions` straight onto the new
 * User document -- literally anyone, unauthenticated, could POST here with
 * {"role": "SUPER_ADMIN", "permissions": [...]} and mint themselves a
 * super admin. Now requires staff.create and blocks minting SUPER_ADMIN
 * unless the caller already is one, same pattern as api/admin/users/route.ts.
 * `permissions` is no longer accepted directly from the client at all --
 * this route only ever creates the User record; RBAC grants go through
 * the Role/UserRole chain via api/admin/users, not a raw array here.
 */
export async function POST(req: Request) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("staff", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB()

    const body = await req.json()

    const requestedRole = String(body.role || "").toUpperCase();
    if (requestedRole === "SUPER_ADMIN") {
      if (!session.isSuperAdmin) {
        return NextResponse.json(
          { success: false, error: "Only Super Admins can create another Super Admin user" },
          { status: 403 }
        );
      }
    } else if (!ASSIGNABLE_ROLES.includes(requestedRole)) {
      return NextResponse.json(
        { success: false, error: `role must be one of: ${['SUPER_ADMIN', ...ASSIGNABLE_ROLES].join(', ')}` },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(
      body.password,
      10
    )

    // Every assignable role here (ADMIN/MANAGER/EMPLOYEE/VENDOR/CUSTOMER/
    // SUPER_ADMIN) is seeded up front (syncSuperAdminRole) -- fail loudly
    // if it's somehow missing rather than create a roleless user.
    const roleDoc = await Role.findOne({ code: requestedRole, businessId: null, vendorId: null });
    if (!roleDoc) {
      return NextResponse.json(
        { success: false, error: `Role "${requestedRole}" is not configured. Seed it in Roles & Permissions first.` },
        { status: 400 }
      );
    }

    const user = await User.create({
      name: body.name,
      email: body.email,
      username: await generateUniqueUserId(),
      password: hashedPassword,
      role: requestedRole,
      businessId: body.businessId,
      mustChangePassword: true,
    })

    await UserRole.create({ userId: user._id, roleId: roleDoc._id, businessId: body.businessId || null });

    logAction({
      action: "CREATE",
      entity: "User",
      entityId: user._id?.toString(),
      after: user,
      req,
      actor: { id: session.user.id, businessId: body?.businessId?.toString() },
    });

    // Best-effort: staff creation must succeed even if the credentials email fails.
    sendAccountCredentialsEmail({
      to: user.email,
      name: user.name,
      tempPassword: body.password,
      businessId: body?.businessId?.toString(),
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      user,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error,
    })
  }
}
