import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { connectDB } from '@/lib/mongodb'
import SalesInvoice from '@/models/SalesInvoice'
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

    // AN-CRM has no separate storefront "Order" record -- every sale
    // (CRM job-sheet closure or POS quick-sale) is already a SalesInvoice,
    // so "orders" on this vendor dashboard are just this vendor's own
    // invoices, not a second collection.
    //
    // SECURITY: was scoped by businessId only -- on a business hosting
    // multiple vendors, every vendor's headline stats (totalOrders,
    // pendingOrders, totalRevenue) and "recent orders" list showed every
    // OTHER vendor's sales too, not just this vendor's own.
    const orderFilter = { businessId: vendor.businessId, vendorId: vendor._id }
    const invoiceFilter = { vendorId: vendor._id, invoiceType: 'B2B' }

    const [allOrders, recentOrders, pendingInvoices] = await Promise.all([
      SalesInvoice.find(orderFilter).lean(),
      SalesInvoice.find(orderFilter)
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
      ['SENT', 'PARTIAL'].includes(o.status)
    ).length
    const totalRevenue = allOrders.reduce(
      (sum: number, o: any) =>
        ['PAID'].includes(o.status) ? sum + (o.grandTotal || 0) : sum,
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
