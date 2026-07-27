/**
 * User Detail API
 * GET    /api/users/[id]  — get single user
 * PATCH  /api/users/[id]  — update user profile / settings
 * DELETE /api/users/[id]  — soft delete user (super admin only)
 */

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import { logAction } from '@/lib/audit/logAction'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })
    }

    const { id } = await params
    // Allow users to fetch their own profile; admins can fetch any
    const role = req.headers.get('x-user-role')
    if (id !== userId && !['SUPER_ADMIN', 'ADMIN'].includes(role || '')) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    await connectDB()
    const user = await User.findById(id)
      .select('-password')
      .lean()

    if (!user || (user as any).isDeleted) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, user })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requesterId = req.headers.get('x-user-id')
    if (!requesterId) {
      return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })
    }

    const { id } = await params
    const role = req.headers.get('x-user-role') || ''
    const isSelf = id === requesterId
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(role)

    // Users can update themselves; admins can update anyone
    if (!isSelf && !isAdmin) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const body = await req.json()
    const updates: any = {}

    // Fields any user can update on their own profile
    const selfFields = ['name', 'phone', 'avatar']
    for (const field of selfFields) {
      if (body[field] !== undefined) updates[field] = body[field]
    }

    // Fields only admins can update
    if (isAdmin) {
      const adminFields = ['email', 'username', 'role', 'isActive', 'defaultOrganizationId', 'defaultBusinessId']
      for (const field of adminFields) {
        if (body[field] !== undefined) updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, message: 'No valid fields to update' }, { status: 400 })
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password')

    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 })
    }

    logAction({
      action: "UPDATE",
      entity: "User",
      entityId: id,
      after: updates,
      req,
    })

    return NextResponse.json({ success: true, user })
  } catch (error: any) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0]
      return NextResponse.json({ success: false, message: `${field} already in use` }, { status: 409 })
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requesterId = req.headers.get('x-user-id')
    const role = req.headers.get('x-user-role') || ''

    if (!requesterId || role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, message: 'Super admin only' }, { status: 403 })
    }

    const { id } = await params

    if (id === requesterId) {
      return NextResponse.json({ success: false, message: 'Cannot delete your own account' }, { status: 400 })
    }

    await connectDB()

    await User.findByIdAndUpdate(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: requesterId,
      isActive: false,
    })

    logAction({
      action: "DELETE",
      entity: "User",
      entityId: id,
      req,
    })

    return NextResponse.json({ success: true, message: 'User deleted' })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}
