import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { connectDB } from '@/lib/mongodb'
// IMPORTANT: canonical models. This route previously declared its own
// minimal inline VendorProfile and Order schemas — whichever module loaded
// first won mongoose's model registry, silently breaking vendor scoping and
// the real Order pipeline everywhere else in the app.
import Order from '@/models/Order'
import { resolveVendorContext } from '@/lib/auth/vendorContext'

export async function GET(req: NextRequest) {
  try {
    const headersList = await headers()
    const userId = headersList.get('x-user-id')
    const userRole = headersList.get('x-user-role')

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (userRole !== 'VENDOR') {
      return NextResponse.json(
        { success: false, message: 'Vendor access required' },
        { status: 403 }
      )
    }

    await connectDB()

    // Recognizes both the vendor owner and vendor staff (a BusinessMember
    // with vendorId set) — previously only the owner's own login could
    // ever see vendor-scoped data here; staff added via /api/vendor/staff
    // or /api/admin/vendor-staff got 404'd on every vendor endpoint.
    const ctx = await resolveVendorContext(userId)
    if (!ctx) {
      return NextResponse.json(
        { success: false, message: 'Vendor profile not found' },
        { status: 404 }
      )
    }
    const vendor = ctx.vendor

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')))
    const status = searchParams.get('status') || ''

    // Orders are routed to vendors per cart line via cart.vendorId
    const vendorFilter: Record<string, any> = {
      'cart.vendorId': String((vendor as any)._id),
    }

    if (status && status !== 'ALL') {
      vendorFilter.status = status.toUpperCase()
    }

    const [total, orders] = await Promise.all([
      (Order as any).countDocuments(vendorFilter),
      (Order as any)
        .find(vendorFilter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ])

    // Show each vendor only THEIR line items and totals
    const vendorIdStr = String((vendor as any)._id)
    const scoped = orders.map((o: any) => {
      const lines = (o.cart || []).filter(
        (l: any) => String(l.vendorId || '') === vendorIdStr
      )
      const vendorTotal = lines.reduce(
        (s: number, l: any) => s + (l.qty || 1) * (l.price || l.sellingPrice || 0),
        0
      )
      return {
        _id: o._id,
        orderId: o.orderId,
        orderNumber: o.orderId,
        customerName: o.customer?.name,
        status: o.status,
        createdAt: o.createdAt,
        items: lines,
        totalAmount: vendorTotal,
      }
    })

    return NextResponse.json({
      success: true,
      orders: scoped,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}
