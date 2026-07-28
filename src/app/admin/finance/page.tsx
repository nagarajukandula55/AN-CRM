'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  TrendingUp,
  CheckCircle,
  Clock,
  Calendar,
  ArrowRight,
  Receipt,
  FileText,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

// Matches models/SalesInvoice.ts's real shape -- was previously read as
// flat `totalAmount`/`customerName`, fields that don't exist on this
// model (it's `grandTotal` and `customer.name`), so every stat card and
// the invoice table below silently showed ₹0 / blank customer for every
// real invoice. This is the single canonical invoice model every
// operating mode (Brand/SC/POS/Sales) writes to, so fixing the field
// mapping here surfaces ALL of them, not just one source.
interface Invoice {
  _id: string
  invoiceNumber: string
  customer?: { name?: string; company?: string; gstNumber?: string }
  grandTotal: number
  taxTotal?: number
  invoiceType?: string
  status: string
  createdAt: string
  dueDate?: string
}

interface Payment {
  _id: string
  amount: number
  invoiceId?: string
  method?: string
  date?: string
  createdAt?: string
  reference?: string
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  PAID: 'success',
  DRAFT: 'neutral',
  SENT: 'info',
  OVERDUE: 'danger',
  CANCELLED: 'danger',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export default function FinancePage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL')

  useEffect(() => {
    async function fetchAll() {
      try {
        // Resolve the active business the same way every other admin page
        // does (vendors/products/integrations) instead of relying on the
        // JWT cookie header alone — this keeps Finance in sync when the
        // user switches business.
        let businessId: string | null = null
        try {
          const meRes = await fetch('/api/auth/me')
          if (meRes.ok) {
            const meData = await meRes.json()
            businessId = meData.user?.activeBusinessId ?? null
          }
        } catch {
          // ignore — fall back to no explicit businessId
        }

        const invoicesUrl = businessId
          ? `/api/sales/invoices?businessId=${businessId}`
          : '/api/sales/invoices'

        const [invRes, payRes] = await Promise.all([
          fetch(invoicesUrl, businessId ? { headers: { 'x-active-business-id': businessId } } : undefined),
          fetch('/api/finance/payments', businessId ? { headers: { 'x-active-business-id': businessId } } : undefined),
        ])
        if (invRes.ok) {
          const d = await invRes.json()
          setInvoices(Array.isArray(d) ? d : (d.invoices ?? []))
        }
        if (payRes.ok) {
          const d = await payRes.json()
          // /api/finance/payments responds with { success, data }, not { payments }
          setPayments(Array.isArray(d) ? d : (d.data ?? d.payments ?? []))
        }
        // 404 on payments is acceptable — stays empty
      } catch {
        // network error — continue with empty arrays
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const totalRevenue = invoices.reduce((s, i) => s + (i.grandTotal ?? 0), 0)
  const collected = invoices
    .filter((i) => i.status === 'PAID')
    .reduce((s, i) => s + (i.grandTotal ?? 0), 0)
  const outstanding = invoices
    .filter((i) => ['SENT', 'OVERDUE', 'PARTIAL'].includes(i.status))
    .reduce((s, i) => s + (i.grandTotal ?? 0), 0)

  const now = new Date()
  const thisMonth = invoices
    .filter((i) => {
      const d = new Date(i.createdAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((s, i) => s + (i.grandTotal ?? 0), 0)

  const taxCollected = invoices
    .filter((i) => i.status === 'PAID')
    .reduce((s, i) => s + (i.taxTotal ?? 0), 0)
  const b2bCount = invoices.filter((i) => i.invoiceType === 'B2B').length
  const b2cCount = invoices.length - b2bCount

  const filteredInvoices = invoices.filter((i) => {
    if (filter === 'PAID') return i.status === 'PAID'
    if (filter === 'UNPAID') return i.status !== 'PAID'
    return true
  })

  if (loading) {
    return <LoadingPanel label="Loading finance data…" />
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Finance"
          description="Revenue, collections, and payment tracking"
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => router.push('/admin')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
              <Link href="/admin/sales">
                <Button>New Invoice <ArrowRight className="w-4 h-4" /></Button>
              </Link>
            </>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {[
            { icon: TrendingUp, label: 'Total Revenue', value: fmt(totalRevenue), sub: 'All invoices', filterValue: 'ALL' as const },
            { icon: CheckCircle, label: 'Collected', value: fmt(collected), sub: 'Paid invoices', filterValue: 'PAID' as const },
            { icon: Clock, label: 'Outstanding', value: fmt(outstanding), sub: 'Sent + Overdue + Partial', filterValue: 'UNPAID' as const },
            { icon: Calendar, label: 'This Month', value: fmt(thisMonth), sub: 'Current month', filterValue: null },
          ].map(({ icon: Icon, label, value, sub, filterValue }) => {
            const isActive = filterValue !== null && filter === filterValue;
            return (
              <Card
                key={label}
                className={`p-6 ${filterValue === null ? 'cursor-default' : 'cursor-pointer'} ${isActive ? 'border-accent ring-2 ring-accent-soft' : 'hover:border-border-strong'}`}
              >
                <button
                  type="button"
                  disabled={filterValue === null}
                  onClick={() => filterValue && setFilter(filter === filterValue ? 'ALL' : filterValue)}
                  className="text-left w-full"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-ink-3 text-sm">{label}</span>
                    <div className="w-8 h-8 rounded-control bg-accent-soft flex items-center justify-center">
                      <Icon className="w-4 h-4 text-accent" />
                    </div>
                  </div>
                  <p className="tabular text-2xl font-semibold text-ink">{value}</p>
                  <p className="text-xs text-ink-3 mt-1">{sub}</p>
                </button>
              </Card>
            );
          })}
        </div>

        {/* Secondary stats: tax + invoice mix, across every source (POS/
            SC/Sales) since they all write to the same SalesInvoice model. */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-ink-3 text-sm">Tax Collected</span>
              <div className="w-8 h-8 rounded-control bg-accent-soft flex items-center justify-center">
                <Receipt className="w-4 h-4 text-accent" />
              </div>
            </div>
            <p className="tabular text-2xl font-semibold text-ink">{fmt(taxCollected)}</p>
            <p className="text-xs text-ink-3 mt-1">Paid invoices only</p>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-ink-3 text-sm">Total Invoices</span>
              <div className="w-8 h-8 rounded-control bg-accent-soft flex items-center justify-center">
                <FileText className="w-4 h-4 text-accent" />
              </div>
            </div>
            <p className="tabular text-2xl font-semibold text-ink">{invoices.length}</p>
            <p className="text-xs text-ink-3 mt-1">{b2bCount} B2B · {b2cCount} B2C</p>
          </Card>
          <Card className="p-6 col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-ink-3 text-sm">Export for GST filing</span>
            </div>
            <Link href="/admin/reports" className="text-sm text-accent hover:underline flex items-center gap-1 mt-2">
              Download invoices ZIP by date range <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Card>
        </div>

        {/* Invoice Filter */}
        <div className="flex gap-1 mb-5">
          {(['ALL', 'PAID', 'UNPAID'] as const).map((f) => (
            <Button key={f} variant={filter === f ? 'primary' : 'secondary'} size="sm" onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
        </div>

        {/* Invoice Table */}
        <Card className="overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="h-section">Invoices</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Invoice #</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Customer</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Date</th>
                  <th className="text-right px-6 py-3 text-ink-3 font-medium">Amount</th>
                  <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState kind="empty" title="No invoices found" /></td></tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr key={inv._id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-6 py-3 font-medium text-ink">{inv.invoiceNumber}</td>
                      <td className="px-6 py-3 text-ink-2">{inv.customer?.name || inv.customer?.company || '—'}</td>
                      <td className="px-6 py-3 text-ink-3">{fmtDate(inv.createdAt)}</td>
                      <td className="px-6 py-3 text-right tabular text-ink">{fmt(inv.grandTotal)}</td>
                      <td className="px-6 py-3 text-center">
                        <Badge tone={STATUS_TONE[inv.status] ?? 'neutral'}>{inv.status}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Payment History */}
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="h-section">Payment History</h2>
          </div>
          {payments.length === 0 ? (
            <EmptyState kind="empty" title="No payment records found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-3 text-ink-3 font-medium">Reference</th>
                    <th className="text-left px-6 py-3 text-ink-3 font-medium">Method</th>
                    <th className="text-left px-6 py-3 text-ink-3 font-medium">Date</th>
                    <th className="text-right px-6 py-3 text-ink-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((pay) => (
                    <tr key={pay._id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-6 py-3 tabular text-ink">{pay.reference ?? pay._id.slice(-8)}</td>
                      <td className="px-6 py-3 text-ink-3">{pay.method ?? '—'}</td>
                      <td className="px-6 py-3 text-ink-3">{fmtDate(pay.date ?? pay.createdAt ?? '')}</td>
                      <td className="px-6 py-3 text-right tabular text-ink">{fmt(pay.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
