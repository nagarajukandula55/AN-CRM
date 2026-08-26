import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { connectDB } from '@/lib/mongodb'
import SalesInvoice from '@/models/SalesInvoice'
import { resolveVendorContext } from '@/lib/auth/vendorContext'

/**
 * A vendor's own running account statement -- every SalesInvoice they've
 * raised (any type -- B2B/B2C/STANDARD) plus a derived "Payment" entry for
 * whichever of those are marked PAID.
 *
 * Was filtering to invoiceType: 'B2B' only -- the old ecommerce-marketplace
 * concept (vendor sells a product, the marketplace invoices the vendor
 * B2B). An SC vendor's real invoices (raised directly to their own
 * customers via Sales Invoices, or generated at workorder close) are
 * B2C/STANDARD, so this page showed nothing for every SC vendor
 * regardless of how many real transactions they had. Reported live
 * ("i did not anything in financial statement atleast happened 2
 * transaction should come there but nothing is there").
 *
 * Also was reading a separate Payment collection for the "Payment" rows --
 * that collection is only ever written by the admin/console manual
 * payment-entry screen (api/finance/payments), never by the SC jobsheet-
 * close flow or the Sales Invoices "Mark Paid" action (both just set
 * SalesInvoice.status = 'PAID' directly), so it was always empty for a
 * real SC vendor too. Payment rows are now derived from the invoice's own
 * status/paidAt/paidAmount instead of a second, unused collection.
 */
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
      isDeleted: { $ne: true },
    }
    if (Object.keys(dateFilter).length > 0) {
      invoiceFilter.createdAt = dateFilter
    }

    const invoices = await SalesInvoice.find(invoiceFilter)
      .sort({ createdAt: 1 })
      .lean()

    // Build unified transaction list -- one "Invoice" row per invoice, plus
    // a "Payment" row for whichever ones are actually marked paid.
    type TxEntry = {
      date: string
      type: 'Invoice' | 'Payment' | 'Credit'
      reference: string
      description: string
      amount: number
      sortDate: Date
    }

    const rawTransactions: TxEntry[] = []
    for (const inv of invoices as any[]) {
      rawTransactions.push({
        date: new Date(inv.createdAt).toISOString(),
        type: 'Invoice',
        reference: inv.invoiceNumber || '',
        description: inv.customer?.name ? `Invoice to ${inv.customer.name}` : (inv.notes || 'Invoice'),
        amount: inv.grandTotal || 0,
        sortDate: new Date(inv.createdAt),
      })
      if (inv.status === 'PAID') {
        const paidAt = inv.paidAt || inv.createdAt
        rawTransactions.push({
          date: new Date(paidAt).toISOString(),
          type: 'Payment',
          reference: inv.invoiceNumber || '',
          description: `Payment received${inv.paymentMethod ? ` via ${inv.paymentMethod}` : ''}`,
          amount: inv.paidAmount || inv.grandTotal || 0,
          sortDate: new Date(paidAt),
        })
      }
    }
    rawTransactions.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime())

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
      (sum: number, inv: any) => sum + (inv.grandTotal || 0),
      0
    )
    const totalPaid = invoices.reduce(
      (sum: number, inv: any) => (inv.status === 'PAID' ? sum + (inv.paidAmount || inv.grandTotal || 0) : sum),
      0
    )
    const outstanding = Math.max(0, totalInvoiced - totalPaid)

    return NextResponse.json({
      success: true,
      data: {
        transactions,
        summary: {
          totalInvoiced,
          totalPaid,
          outstanding,
          // No credit-note offsetting wired into this statement yet
          // (Quotations/Credit Notes live on a separate SalesDocument
          // model this route doesn't read) -- left at 0 rather than
          // silently mixing in unrelated documents.
          creditBalance: 0,
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
