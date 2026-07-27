/**
 * Change Password
 * POST /api/auth/change-password
 *
 * Body: { currentPassword: string, newPassword: string }
 * Requires authenticated session (an_token cookie or Bearer header)
 */

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import { logAction } from '@/lib/audit/logAction'

const SALT_ROUNDS = 12
const MIN_LENGTH = 6

export async function POST(req: Request) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: 'Current and new password are required' },
        { status: 400 }
      )
    }

    if (newPassword.length < MIN_LENGTH) {
      return NextResponse.json(
        { success: false, message: `New password must be at least ${MIN_LENGTH} characters` },
        { status: 400 }
      )
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, message: 'New password must differ from current password' },
        { status: 400 }
      )
    }

    await connectDB()

    // Need to explicitly select the password field (it's select: false)
    const user = await User.findById(userId).select('+password')
    if (!user || user.isDeleted || !user.isActive) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 })
    }

    if (!user.password) {
      return NextResponse.json(
        { success: false, message: 'Account uses SSO — password change not available' },
        { status: 400 }
      )
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password)
    if (!isMatch) {
      return NextResponse.json(
        { success: false, message: 'Current password is incorrect' },
        { status: 400 }
      )
    }

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS)
    user.password = hashed
    user.passwordChangedAt = new Date()
    user.mustChangePassword = false
    await user.save()

    logAction({
      action: "CHANGE_PASSWORD",
      entity: "User",
      entityId: userId,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully. Please sign in again with your new password.',
    })
  } catch (error: any) {
    console.error('Change password error:', error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}
