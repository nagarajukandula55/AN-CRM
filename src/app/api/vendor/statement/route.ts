import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { connectDB } from '@/lib/mongodb'
import SalesInvoice from '@/models/SalesInvoice'
import Payment from '@/models/Payment'
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

    // Recognizes both the vendor owner and vendor staff — see
    // lib/auth/vendorContext.ts.
    const ctx = await resolveVendorContext(userId)
    if (!ctx) {
      return NextResponse.json(
        { success: false, message: 'Vendor profile not found' },
        { status: 404 }
      )
    }
    const vendor = ctx.vendor

    const { searchParams } = new URL(req.url)
    const fromStr = searchParams.get('from')
    const toStr = searchParams.get('to')

    const dateFilter: Record<string, any> = {}
    if (fromStr) {
      dateFilter.$gte = new Date(fromStr)
    }
    if (toStr) {
      const toDate = new Date(toStr)
      toDate.setHours(23, 59, 59, 999)
      dateFilter.$lte = toDate
    }

    const invoiceFilter: Record<string, any> = {
      vendorId: (vendor as any)._id,
      invoiceType: 'B2B',
    }
    if (Object.keys(dateFilter).length > 0) {
      invoiceFilter.createdAt = dateFilter
    }

    const invoices = await SalesInvoice.find(invoiceFilter)
      .sort({ createdAt: 1 })
      .lean()

    // Payments are linked to invoices by invoiceId (canonical Payment model)
    const invoiceIds = invoices.map((i: any) => String(i._id))
    const paymentFilter: Record<string, any> = { invoiceId: { $in: invoiceIds } }
    if (Object.keys(dateFilter).length > 0) {
      paymentFilter.createdAt = dateFilter
    }
    const payments = invoiceIds.length
      ? await (Payment as any).find(paymentFilter).sort({ createdAt: 1 }).lean()
      : []

    // Build unified transaction list
    type TxEntry = {
      date: string
      type: 'Invoice' | 'Payment' | 'Credit'
      reference: string
      description: string
      amount: number
      sortDate: Date
    }

    const rawTransactions: TxEntry[] = [
      ...invoices.map((inv: any) => ({
        date: new Date(inv.createdAt).toISOString(),
        type: 'Invoice' as const,
        reference: inv.invoiceNumber || '',
        description: inv.notes || 'Invoice',
        amount: inv.grandTotal || 0,
        sortDate: new Date(inv.createdAt),
      })),
      ...payments.map((pay: any) => ({
        date: new Date(pay.createdAt).toISOString(),
        type: 'Payment' as
          | 'Invoice'
          | 'Payment'
          | 'Credit',
        reference: pay.utr || pay.gatewayPaymentId || '',
        description: `Payment via ${pay.method || pay.gateway || 'transfer'}`,
        amount: pay.amount || 0,
        sortDate: new Date(pay.createdAt),
      })),
    ].sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime())

    // Calculate running balance (invoices add to balance, payments reduce it)
    let runningBalance = 0
    const transactions = rawTransactions.map((tx) => {
      if (tx.type === 'Invoice') {
        runningBalance += tx.amount
      } else {
        runningBalance -= tx.amount
      }
      return {
        date: tx.date,
        type: tx.type,
        reference: tx.reference,
        description: tx.description,
        amount: tx.amount,
        balance: runningBalance,
      }
    })

    // Summary calculations
    const totalInvoiced = invoices.reduce(
      (sum: number, inv: any) => sum + (inv.totalAmount || 0),
      0
    )
    const totalPaid = payments.reduce(
      (sum: number, pay: any) =>
        pay.type !== 'Credit' ? sum + (pay.amount || 0) : sum,
      0
    )
    const creditBalance = payments.reduce(
      (sum: number, pay: any) =>
        pay.type === 'Credit' ? sum + (pay.amount || 0) : sum,
      0
    )
    const outstanding = Math.max(0, totalInvoiced - totalPaid - creditBalance)

    return NextResponse.json({
      success: true,
      data: {
        transactions,
        summary: {
          totalInvoiced,
          totalPaid,
          outstanding,
          creditBalance,
        },
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}
