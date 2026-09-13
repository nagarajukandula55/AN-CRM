/**
 * Sales Orders API
 */
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import mongoose, { Schema, Model } from 'mongoose'
import { notify } from '@/lib/notify'
import { generateDocumentNumber } from '@/core/numbering/numberingService'
import { logAction } from '@/lib/audit/logAction'
import { getEnrichedSession } from '@/lib/auth/session-enriched'
import { resolveAuthorizedBusinessId } from '@/lib/auth/resolveAuthorizedBusinessId'

const SalesOrderSchema = new Schema({
  orderNumber: { type: String, unique: true },
  customer: { type: String, required: true },
  customerEmail: String,
  items: [{
    name: String, sku: String, quantity: Number, unitPrice: Number, total: Number
  }],
  totalAmount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['DRAFT','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED'], default: 'DRAFT' },
  businessId: String,
  notes: String,
  deliveryDate: Date,
  shippingAddress: String,
  isDeleted: { type: Boolean, default: false },
  createdBy: String,
}, { timestamps: true, versionKey: false })

// Every list query filters by businessId and sorts by createdAt — without
// this index it's a full collection scan on every page load.
SalesOrderSchema.index({ businessId: 1, isDeleted: 1, createdAt: -1 })
SalesOrderSchema.index({ createdBy: 1, isDeleted: 1, createdAt: -1 })

const SalesOrder: Model<any> = mongoose.models.SalesOrder || mongoose.model('SalesOrder', SalesOrderSchema)

/**
 * REMOVED: a local getNextOrderNumber() used to live here — an ELEVENTH
 * previously-undiscovered duplicate number generator, globally-scoped
 * (`findOne({}, ...)` with no businessId filter — every business shared
 * one counter) and race-prone (find-highest-then-increment). Replaced
 * with the canonical core/numbering/numberingService.ts, scoped per
 * business via the existing SALES_ORDER document type.
 */

export async function GET(req: Request) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })
    await connectDB()
    // Scope to the active business — same header-or-query convention as
    // /api/sales/invoices — otherwise every business shares the same
    // orders list, which is a real multi-tenant data leak.
    const url = new URL(req.url)
    // SECURITY: bizId used to be trusted straight from the header/query
    // param with no ownership check.
    const session = await getEnrichedSession()
    const bizId = await resolveAuthorizedBusinessId(
      userId,
      req.headers.get('x-active-business-id') || url.searchParams.get('businessId'),
      !!session?.isSuperAdmin,
      session?.business?.businessId || null
    )
    const filter: Record<string, unknown> = { isDeleted: false }
    if (bizId) {
      filter.businessId = bizId
    } else {
      filter.createdBy = userId
    }
    // Paginate — previously this returned EVERY order ever created, which
    // grows unboundedly and is a primary "page takes forever to load" cause.
    const page  = Math.max(1, parseInt(url.searchParams.get('page')  || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '20')))
    // Status filter now applied server-side (the list page used to filter
    // the full unpaginated array client-side) -- with real pagination that
    // would only ever filter whatever happened to be on the current page.
    const status = url.searchParams.get('status')
    const listFilter = { ...filter, ...(status && status !== 'ALL' ? { status } : {}) }

    const [orders, total, revenueAgg, statusCountsAgg] = await Promise.all([
      SalesOrder.find(listFilter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SalesOrder.countDocuments(listFilter),
      // Revenue computed in the DB across ALL matching orders, so the stat
      // stays correct even though the list is paginated.
      SalesOrder.aggregate([
        { $match: { ...filter, status: 'DELIVERED' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      // KPI counts by status, over the FULL matching set (not just the
      // status filter or the current page) -- so the status cards stay
      // accurate no matter which page/filter is currently applied.
      SalesOrder.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ])
    const totalRevenue = revenueAgg[0]?.total || 0
    const statusCounts: Record<string, number> = {}
    for (const row of statusCountsAgg as { _id: string; count: number }[]) {
      statusCounts[row._id] = row.count
    }
    return NextResponse.json({ success: true, orders, totalRevenue, total, page, limit, statusCounts })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })
    await connectDB()
    const body = await req.json()
    // SECURITY: body.businessId used to be trusted directly.
    const session = await getEnrichedSession()
    const bizId = await resolveAuthorizedBusinessId(
      userId,
      req.headers.get('x-active-business-id') || body.businessId,
      !!session?.isSuperAdmin,
      session?.business?.businessId || null
    )
    if (!bizId) {
      return NextResponse.json({ success: false, message: 'businessId is required' }, { status: 400 })
    }
    const { value: orderNumber } = await generateDocumentNumber(bizId, 'SALES_ORDER')
    const total = (body.items || []).reduce((s: number, i: any) => s + (i.quantity * i.unitPrice), 0)
    const order = await SalesOrder.create({ ...body, businessId: bizId, orderNumber, totalAmount: total, createdBy: userId })

    logAction({
      action: 'CREATE',
      entity: 'SalesOrder',
      entityId: order?._id?.toString(),
      after: order,
      req,
      actor: { businessId: bizId },
    })

    // Fire notification (non-blocking)
    notify({
      event: 'NEW_ORDER',
      message: `🛒 New sales order received.\nOrder: ${orderNumber}\nCustomer: ${body.customer || 'N/A'}\nAmount: ₹${total.toLocaleString('en-IN')}\nStatus: ${body.status || 'DRAFT'}`,
    }).catch(() => {});

    return NextResponse.json({ success: true, order }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}
