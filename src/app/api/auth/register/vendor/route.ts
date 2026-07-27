import { NextRequest, NextResponse } from 'next/server'
import bcryptjs from 'bcryptjs'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import Business from '@/models/Business'
// IMPORTANT: use the canonical VendorProfile model. This route previously
// declared its own inline VendorProfile schema WITHOUT businessId — whichever
// module loaded first won the mongoose.models registry, silently disabling
// business scoping, and self-registered vendors were created as orphans not
// linked to any business ("vendors under which business??").
import VendorProfile from '@/models/VendorProfile'
import Role from '@/models/Role'
import UserRole from '@/models/UserRole'
import { generateGlobalDocumentNumber } from '@/core/numbering/numberingService'
import { logAction } from '@/lib/audit/logAction'
import { generateUniqueUserId } from '@/lib/auth/generateUserId'

/**
 * REMOVED: a local generateVendorId() used to live here, producing a
 * THIRD distinct vendor-ID format ("VND-2026-0001", with a year segment)
 * — different from BOTH other vendor-ID generators found in this codebase
 * (vendors/route.ts and vendors/apply/route.ts each produced "VND-0001",
 * no year, and used a different padding scheme again in admin/users/route.ts's
 * "VEN-001"). All were also countDocuments()-based, i.e. race-prone.
 * Consolidated onto the canonical numbering engine's global-scope variant
 * (VendorProfile.vendorId is globally unique — see that model — so all
 * vendor-creation paths must share ONE atomic counter, not one each).
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      businessId,
      companyName,
      contactPerson,
      email,
      username,
      password,
      phone,
      gstNumber,
      panNumber,
      category,
      city,
      state,
      pincode,
    } = body

    if (!companyName || !contactPerson || !email || !password) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Company name, contact person, email and password are required',
        },
        { status: 400 }
      )
    }

    if (!businessId) {
      return NextResponse.json(
        {
          success: false,
          message:
            'businessId is required — a vendor must register under a specific business (e.g. Native)',
        },
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

    // The target business must exist and be active
    const business = await (Business as any)
      .findOne({ _id: businessId, isActive: true })
      .select('_id name')
      .lean()
    if (!business) {
      return NextResponse.json(
        { success: false, message: 'Business not found or inactive' },
        { status: 404 }
      )
    }

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

    const user = await User.create({
      name: contactPerson.trim(),
      email: email.toLowerCase().trim(),
      username: trimmedUsername || (await generateUniqueUserId()),
      password: hashedPassword,
      phone: phone?.trim() || undefined,
      role: 'VENDOR',
      isActive: false, // Pending approval
      isEmailVerified: false,
      authProvider: 'credentials',
    })

    // Pending-approval floor role (zero permissions, matches isActive:false
    // above) -- finalize/route.ts additively grants this vendor's own
    // VENDOR_OWNER role once approved, so this account is never roleless
    // in the meantime.
    const pendingRole = await Role.findOne({ code: 'VENDOR', businessId: null, vendorId: null });
    if (pendingRole) {
      await UserRole.create({ userId: user._id, roleId: pendingRole._id });
    }

    const { value: vendorId } = await generateGlobalDocumentNumber('VENDOR', String(business._id))

    const vendorProfile = await VendorProfile.create({
      userId: user._id,
      businessId: business._id,
      vendorId,
      companyName: companyName.trim(),
      contactPerson: contactPerson.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || undefined,
      gstNumber: gstNumber?.toUpperCase().trim() || undefined,
      panNumber: panNumber?.toUpperCase().trim() || undefined,
      category: category || undefined,
      address: {
        city: city?.trim() || undefined,
        state: state?.trim() || undefined,
        pincode: pincode?.trim() || undefined,
      },
      isApproved: false,
    })

    logAction({
      action: "CREATE",
      entity: "VendorProfile",
      entityId: vendorProfile._id.toString(),
      after: { vendorId: vendorProfile.vendorId, companyName: vendorProfile.companyName },
      req,
      actor: { businessId: business._id.toString() },
    });

    return NextResponse.json(
      {
        success: true,
        message:
          'Vendor application submitted successfully. Your account will be reviewed and approved within 24 hours.',
        vendorId: vendorProfile.vendorId,
        business: business.name,
      },
      { status: 201 }
    )
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, message: 'An account with this email already exists' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}