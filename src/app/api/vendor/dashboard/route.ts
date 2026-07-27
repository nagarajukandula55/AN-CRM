import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { connectDB } from '@/lib/mongodb'
import SalesInvoice from '@/models/SalesInvoice'
import Order from '@/models/Order'
import { resolveVendorContext } from '@/lib/auth/vendorContext'


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

    // Recognizes both the vendor owner and vendor staff — see
    // lib/auth/vendorContext.ts for why this replaced a direct
    // VendorProfile.findOne({userId}) lookup.
    const ctx = await resolveVendorContext(userId)
    if (!ctx) {
      return NextResponse.json(
        { success: false, message: 'Vendor profile not found' },
        { status: 404 }
      )
    }
    const vendor = ctx.vendor as any

    // Orders are routed per cart line (cart.vendorId); invoices carry vendorId
    const orderFilter = { 'cart.vendorId': String(vendor._id) }
    const invoiceFilter = { vendorId: vendor._id, invoiceType: 'B2B' }

    const [allOrders, recentOrders, pendingInvoices] = await Promise.all([
      (Order as any).find(orderFilter).lean(),
      (Order as any)
        .find(orderFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      SalesInvoice.find({
        ...invoiceFilter,
        status: { $in: ['SENT', 'OVERDUE'] },
      })
        .sort({ dueDate: 1 })
        .limit(3)
        .lean(),
    ])

    const totalOrders = allOrders.length
    const pendingOrders = allOrders.filter((o: any) =>
      ['CREATED', 'PAID', 'PENDING_PAYMENT'].includes(o.status)
    ).length
    const totalRevenue = allOrders.reduce(
      (sum: number, o: any) =>
        ['DELIVERED', 'COMPLETED'].includes(o.status)
          ? sum + (o.pricing?.grandTotal || o.totalAmount || 0)
          : sum,
      0
    )

    const allInvoices = await SalesInvoice.find(invoiceFilter).lean()
    const outstanding = allInvoices.reduce(
      (sum: number, inv: any) =>
        ['SENT', 'OVERDUE'].includes(inv.status)
          ? sum + ((inv.grandTotal || 0) - (inv.paidAmount || 0))
          : sum,
      0
    )

    return NextResponse.json({
      success: true,
      data: {
        vendor: {
          companyName: (vendor as any).companyName,
          vendorId: (vendor as any).vendorId,
        },
        stats: {
          totalOrders,
          pendingOrders,
          totalRevenue,
          outstanding,
        },
        orders: recentOrders,
        invoices: pendingInvoices,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}
