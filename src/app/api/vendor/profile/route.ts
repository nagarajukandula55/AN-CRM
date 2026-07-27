import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { connectDB } from '@/lib/mongodb'
import mongoose from 'mongoose'
import { logAction } from "@/lib/audit/logAction";
// Was a locally-declared, duplicate, much-thinner VendorProfile schema —
// whichever module loaded first won mongoose's model registry, so this
// route could silently be reading/writing through a schema that dropped
// fields the canonical model has (agreementId, status, businessId, etc.),
// same class of bug already fixed in vendor/orders/route.ts. Now uses the
// real model, and recognizes vendor staff via resolveVendorContext too.
import VendorProfile from '@/models/VendorProfile'
import { resolveVendorContext } from '@/lib/auth/vendorContext'
import { resolveOwnerOrManagerVendor } from '@/core/access/vendorAccess.service'

export async function GET() {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    await connectDB()

    // View access extends to vendor staff too — see lib/auth/vendorContext.ts.
    const ctx = await resolveVendorContext(userId)

    if (!ctx) {
      return NextResponse.json(
        { success: false, message: 'Vendor profile not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: ctx.vendor })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()

    // Only allow updating these fields — never vendorId, rating, isApproved, userId
    const allowedUpdate: Record<string, any> = {}

    if (body.companyName !== undefined)
      allowedUpdate.companyName = body.companyName
    if (body.contactPerson !== undefined)
      allowedUpdate.contactPerson = body.contactPerson
    if (body.phone !== undefined) allowedUpdate.phone = body.phone
    if (body.gstNumber !== undefined) allowedUpdate.gstNumber = body.gstNumber
    if (body.panNumber !== undefined) allowedUpdate.panNumber = body.panNumber
    if (body.category !== undefined) allowedUpdate.category = body.category
    if (body.termsAndConditions !== undefined)
      allowedUpdate.termsAndConditions = String(body.termsAndConditions).slice(0, 5000)
    if (body.enableB2BOrdering !== undefined)
      allowedUpdate.enableB2BOrdering = !!body.enableB2BOrdering
    if (body.marketplaceCommissionPercent !== undefined)
      allowedUpdate.marketplaceCommissionPercent = Number(body.marketplaceCommissionPercent) || 0
    if (Array.isArray(body.servicePincodes))
      allowedUpdate.servicePincodes = body.servicePincodes
        .map((p: unknown) => String(p).trim())
        .filter((p: string) => /^[1-9][0-9]{5}$/.test(p))

    if (body.address && typeof body.address === 'object') {
      if (body.address.street !== undefined)
        allowedUpdate['address.street'] = body.address.street
      if (body.address.city !== undefined)
        allowedUpdate['address.city'] = body.address.city
      if (body.address.state !== undefined)
        allowedUpdate['address.state'] = body.address.state
      if (body.address.pincode !== undefined)
        allowedUpdate['address.pincode'] = body.address.pincode
    }

    if (body.bankDetails && typeof body.bankDetails === 'object') {
      if (body.bankDetails.accountName !== undefined)
        allowedUpdate['bankDetails.accountName'] = body.bankDetails.accountName
      if (body.bankDetails.accountNumber !== undefined)
        allowedUpdate['bankDetails.accountNumber'] =
          body.bankDetails.accountNumber
      if (body.bankDetails.ifscCode !== undefined)
        allowedUpdate['bankDetails.ifscCode'] =
          body.bankDetails.ifscCode?.toUpperCase()
      if (body.bankDetails.bankName !== undefined)
        allowedUpdate['bankDetails.bankName'] = body.bankDetails.bankName
    }

    await connectDB()

    // Service Record settings (printed after closing a job sheet) are
    // Owner/Manager-only, same restriction already applied to Service
    // Charge -- not just any vendor staff member.
    if (body.serviceCenterInfo && typeof body.serviceCenterInfo === 'object') {
      const ownerOrManager = await resolveOwnerOrManagerVendor(userId)
      if (!ownerOrManager) {
        return NextResponse.json(
          { success: false, message: 'Only a vendor Owner or Manager can edit Service Record settings' },
          { status: 403 }
        )
      }
      if (body.serviceCenterInfo.hours !== undefined)
        allowedUpdate['serviceCenterInfo.hours'] = String(body.serviceCenterInfo.hours).slice(0, 200)
      if (body.serviceCenterInfo.hotline !== undefined)
        allowedUpdate['serviceCenterInfo.hotline'] = String(body.serviceCenterInfo.hotline).slice(0, 50)
    }

    // Staff can update the same vendor profile the owner sees — resolve
    // which vendor document that is instead of matching on this caller's
    // own userId (only ever true for the Owner).
    const ctx = await resolveVendorContext(userId)
    if (!ctx) {
      return NextResponse.json(
        { success: false, message: 'Vendor profile not found' },
        { status: 404 }
      )
    }

    const updated = (await VendorProfile.findOneAndUpdate(
      { _id: (ctx.vendor as any)._id },
      { $set: allowedUpdate },
      { new: true, runValidators: true }
    ).lean()) as (Record<string, any> & { _id?: mongoose.Types.ObjectId }) | null

    if (!updated) {
      return NextResponse.json(
        { success: false, message: 'Vendor profile not found' },
        { status: 404 }
      )
    }

    logAction({
      action: "UPDATE",
      entity: "VendorProfile",
      entityId: updated._id?.toString(),
      after: updated,
      req,
    });

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      data: updated,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}
