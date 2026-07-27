import { NextRequest, NextResponse } from 'next/server'
import bcryptjs from 'bcryptjs'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import Business from '@/models/Business'
import BusinessMember from '@/models/BusinessMember'
import Role from '@/models/Role'
import UserRole from '@/models/UserRole'
import SsoSourceMapping from '@/models/SsoSourceMapping'
import { logAction } from '@/lib/audit/logAction'
import { generateUniqueUserId } from '@/lib/auth/generateUserId'
import { sendWelcomeEmail } from '@/services/email/resend.service'

// Per explicit direction: EVERY new user starts with exactly one access —
// the shopnative.in view floor. It's removed automatically the moment any
// real access is granted (see core/access/floorRoles.service.ts), so the
// user retains only what was explicitly added and login routing follows.
const FALLBACK_ROLE_CODE = 'CUSTOMER_SHOPNATIVE'
const FALLBACK_SOURCE_LABEL = 'shopnative'

/**
 * Best-effort SSO source detection: match the request's Origin/Referer
 * host against the admin-editable SsoSourceMapping list (managed at
 * /admin/sso, not hardcoded) so a new storefront can be added without a
 * code change. Falls back to the most restrictive default role/label if
 * nothing matches or the mapping is inactive.
 */
async function resolveRegistrationSource(req: NextRequest) {
  const originHeader = req.headers.get('origin') || req.headers.get('referer') || ''
  let host = ''
  try {
    host = originHeader ? new URL(originHeader).hostname.toLowerCase() : ''
  } catch {
    host = ''
  }

  const mappings = await SsoSourceMapping.find({ isActive: true }).lean()
  const match = mappings.find((m: any) => host && host.includes(m.urlPattern.toLowerCase()))

  if (match) {
    return { sourceLabel: match.sourceLabel, roleCode: match.defaultRoleCode }
  }
  return { sourceLabel: FALLBACK_SOURCE_LABEL, roleCode: FALLBACK_ROLE_CODE }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, password, phone, username, businessId, accountType, businessName, gstNumber } = body

    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, message: 'Name, email and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          success: false,
          message: 'Password must be at least 8 characters long',
        },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: 'Invalid email address' },
        { status: 400 }
      )
    }

    await connectDB()

    // Check if email already taken
    const existing = await User.findOne({
      email: email.toLowerCase().trim(),
      isDeleted: false,
    })

    if (existing) {
      return NextResponse.json(
        { success: false, message: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    // User ID — collected at signup per the requirement that it be unique.
    // Reuses the User model's existing `username` field (unique + sparse
    // already), rather than adding a second redundant field. Every user
    // must end up with a real value here (never left blank) — see
    // lib/auth/generateUserId.ts for why a blank/null username silently
    // breaks the next signup that also leaves it blank.
    const trimmedUsername = username ? String(username).toLowerCase().trim() : undefined
    if (trimmedUsername) {
      const existingUsername = await User.findOne({
        username: trimmedUsername,
        isDeleted: false,
      })
      if (existingUsername) {
        return NextResponse.json(
          { success: false, message: 'This user ID is already taken' },
          { status: 409 }
        )
      }
    }

    const hashedPassword = await bcryptjs.hash(password, 12)

    // Resolve which floor role this registration gets BEFORE creating the
    // User, so a missing/misconfigured Role never results in a roleless
    // account -- every user must get a non-blank role at creation.
    const { sourceLabel, roleCode } = await resolveRegistrationSource(req)
    let floorRole = await Role.findOne({ code: roleCode, businessId: null, vendorId: null })
    // Self-heal the three well-known floor codes (see FLOOR_ROLE_CODES in
    // admin/users/[id]/route.ts) if the Role document is ever missing --
    // these are meant to always exist and cost nothing to recreate with a
    // minimal/no-op permission set. A missing role for a CUSTOM SSO source
    // mapping (admin/sso) still hard-errors below, since that genuinely
    // means an admin misconfigured a mapping and silently minting a role
    // for it would hide that mistake.
    if (!floorRole && ['CUSTOMER', 'CUSTOMER_ANGROUP', 'CUSTOMER_SHOPNATIVE'].includes(roleCode)) {
      floorRole = await Role.create({
        code: roleCode,
        name: roleCode.replace(/_/g, ' '),
        description: 'Minimal self-registration floor role.',
        permissions: [],
        businessId: null,
        vendorId: null,
        isSystem: true,
      });
    }
    if (!floorRole) {
      return NextResponse.json(
        {
          success: false,
          message: 'Registration is temporarily unavailable (default role not configured). Please contact support.',
        },
        { status: 500 }
      )
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      username: trimmedUsername || (await generateUniqueUserId()),
      password: hashedPassword,
      phone: phone?.trim() || undefined,
      role: 'CUSTOMER',
      accountType: accountType === 'BUSINESS' ? 'BUSINESS' : 'RETAIL',
      businessName: accountType === 'BUSINESS' ? businessName?.trim() || undefined : undefined,
      gstNumber: accountType === 'BUSINESS' ? gstNumber?.trim() || undefined : undefined,
      registrationSource: sourceLabel,
      isActive: true,
      isEmailVerified: false,
      authProvider: 'credentials',
    })

    await UserRole.create({ userId: user._id, roleId: floorRole._id })

    // Every registered user (from any storefront, e.g. Native) becomes a
    // CUSTOMER-level BusinessMember of the target B2C business -- nothing
    // more. A caller (a storefront) may pass its own businessId explicitly;
    // otherwise fall back to the first active B2C-enabled business, same as
    // before. Was previously declaring inline duplicate BusinessMember/
    // Business schemas instead of importing the canonical models -- a
    // classic Mongoose global-model-registry race (whichever definition
    // loaded first silently won app-wide) -- and never set `memberType`,
    // so BusinessMemberSchema's default ('STAFF') applied to every new
    // customer instead of 'CUSTOMER'.
    try {
      const targetBusiness = businessId
        ? await Business.findOne({ _id: businessId, isDeleted: false, isActive: true }).lean()
        : await Business.findOne({
            isDeleted: false,
            isActive: true,
            'marketplace.enableB2C': true,
          }).lean()

      if (targetBusiness) {
        await BusinessMember.create({
          userId: user._id,
          businessId: (targetBusiness as any)._id,
          memberType: 'CUSTOMER',
          status: 'ACTIVE',
          isDefaultBusiness: true,
        })
      }
    } catch {
      // Non-fatal: proceed even if BusinessMember creation fails
    }

    logAction({
      action: "CREATE",
      entity: "User",
      entityId: user._id.toString(),
      after: { name: user.name, email: user.email, role: user.role },
      req,
    });

    // Best-effort: registration must succeed even if the welcome email fails.
    sendWelcomeEmail({ to: user.email, name: user.name }).catch(() => {})

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully',
        userId: user._id.toString(),
        // Always non-null now (generated if the caller didn't choose one) —
        // this doubles as the "vendor code" a vendor uses on /vendor/staff
        // to add this person as their staff, and as the ID a business
        // admin looks up to add this person to a business as an employee.
        username: user.username,
      },
      { status: 201 }
    )
  } catch (error: any) {
    if (error.code === 11000) {
      const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'email'
      return NextResponse.json(
        {
          success: false,
          message:
            field === 'username'
              ? 'This user ID is already taken'
              : 'An account with this email already exists',
        },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}
