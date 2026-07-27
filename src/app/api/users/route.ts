/**
 * Users API
 * GET  /api/users  — list users (admin only)
 * POST /api/users  — create user (admin only)
 */

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import Role from '@/models/Role'
import UserRole from '@/models/UserRole'
import { logAction } from '@/lib/audit/logAction'
import { sendAccountCredentialsEmail } from '@/services/email/resend.service'
import { getEnrichedSession } from '@/lib/auth/session-enriched'
import { requireAnyPermission } from '@/middleware/permission.guard'
import { buildPermissionCode } from '@/core/access/actions'
import { generateUniqueUserId } from '@/lib/auth/generateUserId'

const SALT_ROUNDS = 12

export async function GET(req: Request) {
  try {
    // Was gated purely on the legacy x-user-role header (ADMIN/SUPER_ADMIN
    // only), which never checked the real RBAC permission system at all --
    // a role explicitly granted "Employees" access from Admin > Access
    // still 403'd here, because that grant has nothing to do with the flat
    // User.role enum. This endpoint backs the user-search autocomplete used
    // by Add Employee/Add Staff, so anyone who can create/edit employees or
    // view the platform's users should be able to search here too.
    const legacyRole = req.headers.get('x-user-role') || ''
    if (!['SUPER_ADMIN', 'ADMIN'].includes(legacyRole)) {
      const session = await getEnrichedSession()
      try {
        requireAnyPermission(session as any, [
          buildPermissionCode('users', 'view'),
          buildPermissionCode('employees', 'view'),
          buildPermissionCode('employees', 'create'),
        ])
      } catch {
        return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 })
      }
    }

    await connectDB()

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const isActive = searchParams.get('isActive')
    const userRole = searchParams.get('role')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const query: any = { isDeleted: false }
    if (isActive !== null && isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true'
    }
    if (userRole) query.role = userRole
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ]
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ])

    return NextResponse.json({
      success: true,
      users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error: any) {
    console.error('Users GET error:', error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const role = req.headers.get('x-user-role') || ''
    const requesterId = req.headers.get('x-user-id')

    if (!requesterId || !['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 })
    }

    await connectDB()

    const body = await req.json()
    const { name, email, username, phone, password, userRole, isActive } = body

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ success: false, message: 'Name and email are required' }, { status: 400 })
    }

    // Only super admin can create admins
    if (userRole === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, message: 'Only super admin can assign SUPER_ADMIN role' }, { status: 403 })
    }

    const hashedPassword = password ? await bcrypt.hash(password, SALT_ROUNDS) : undefined

    // STAFF (this route's default) has no RBAC Role code of its own --
    // maps onto the seeded EMPLOYEE base role, same as every other
    // "generic staff" bucket in this codebase. Every other value must
    // resolve to a real, seeded Role -- fail rather than create a
    // roleless user.
    const requestedRoleCode = String(userRole || 'STAFF').toUpperCase();
    const roleCodeForLookup = requestedRoleCode === 'STAFF' ? 'EMPLOYEE' : requestedRoleCode;
    const roleDoc = await Role.findOne({ code: roleCodeForLookup, businessId: null, vendorId: null });
    if (!roleDoc) {
      return NextResponse.json(
        { success: false, message: `Role "${requestedRoleCode}" is not configured. Seed it in Roles & Permissions first.` },
        { status: 400 }
      );
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      username: username?.toLowerCase()?.trim() || (await generateUniqueUserId()),
      phone: phone?.trim() || null,
      password: hashedPassword,
      role: userRole || 'STAFF',
      isActive: isActive !== false,
      isEmailVerified: false,
      authProvider: 'credentials',
      mustChangePassword: true,
    })

    await UserRole.create({ userId: user._id, roleId: roleDoc._id });

    const userObj = user.toObject()
    delete (userObj as any).password

    logAction({
      action: "CREATE",
      entity: "User",
      entityId: user._id?.toString(),
      after: userObj,
      req,
    })

    // Best-effort: user creation must succeed even if the credentials email fails.
    if (password) {
      sendAccountCredentialsEmail({ to: user.email, name: user.name, tempPassword: password }).catch(() => {})
    }

    return NextResponse.json({ success: true, user: userObj }, { status: 201 })
  } catch (error: any) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0]
      return NextResponse.json({ success: false, message: `${field} already exists` }, { status: 409 })
    }
    console.error('Users POST error:', error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}
