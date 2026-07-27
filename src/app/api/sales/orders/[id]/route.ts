/**
 * GET /api/sales/orders/[id] — single-record fetch for the "Orders" admin
 * page's Print action. Added alongside the print page; the base
 * sales/orders/route.ts had no single-record GET at all before this.
 */
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import mongoose, { Schema, Model } from 'mongoose'

// Same inline schema as sales/orders/route.ts -- Mongoose reuses the
// already-registered "SalesOrder" model if that file's module already ran
// in this process, so this doesn't double-register or diverge from it.
const SalesOrderSchema = new Schema({
  orderNumber: { type: String, unique: true },
  customer: { type: String, required: true },
  customerEmail: String,
  items: [{
    name: String, sku: String, quantity: Number, unitPrice: Number, total: Number
  }],
  totalAmount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['DRAFT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'], default: 'DRAFT' },
  businessId: String,
  notes: String,
  deliveryDate: Date,
  shippingAddress: String,
  isDeleted: { type: Boolean, default: false },
  createdBy: String,
}, { timestamps: true, versionKey: false })

const SalesOrder: Model<any> = mongoose.models.SalesOrder || mongoose.model('SalesOrder', SalesOrderSchema)

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })

    await connectDB()

    const { id } = await context.params
    const order = await SalesOrder.findOne({ _id: id, isDeleted: false }).lean()
    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, order })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
