'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { FileText, AlertCircle, DollarSign, TrendingUp, Clock } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  taxAmount: number
  total: number
}

interface Invoice {
  _id: string
  invoiceNumber: string
  status: string
  grandTotal: number
  subtotal: number
  taxTotal: number
  issueDate: string
  createdAt: string
  items: InvoiceItem[]
  notes?: string
}

interface Summary {
  totalInvoiced: number
  totalPaid: number
  outstanding: number
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SENT: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
  FAILED: 'danger',
  PARTIAL: 'info',
}

export default function VendorInvoicesPage() {
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: json, error: fetchError, isLoading: loading } = useSWR('/api/vendor/invoices')
  const invoices: Invoice[] = json?.success ? json.invoices || [] : []
  const summary: Summary | null = json?.success ? json.summary || null : null
  const error: string = fetchError
    ? 'Failed to load invoices'
    : (json && !json.success ? (json.message || 'Failed to load invoices') : '')

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader title="Invoices" description="B2B invoices generated automatically when your products sell" />

        {error && (
          <div className="mb-6 flex items-center gap-2 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink-3">Total Invoiced</span>
                <FileText className="w-4 h-4 text-ink-3" />
              </div>
              <p className="tabular text-xl font-semibold text-ink">{formatCurrency(summary.totalInvoiced)}</p>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink-3">Total Paid</span>
                <TrendingUp className="w-4 h-4 text-success" />
              </div>
              <p className="tabular text-xl font-semibold text-success">{formatCurrency(summary.totalPaid)}</p>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink-3">Outstanding</span>
                <Clock className="w-4 h-4 text-warning" />
              </div>
              <p className="tabular text-xl font-semibold text-warning">{formatCurrency(summary.outstanding)}</p>
            </Card>
          </div>
        )}

        <Card className="overflow-hidden">
          {loading ? (
            <LoadingPanel label="Loading invoices…" />
          ) : invoices.length === 0 ? (
            <EmptyState kind="empty" title="No invoices yet" description="They'll appear here once your products start selling." />
          ) : (
            <div className="divide-y divide-border">
              {invoices.map((inv) => {
                const isOpen = expanded === inv._id
                return (
                  <div key={inv._id}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : inv._id)}
                      className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-surface-2 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink tabular">{inv.invoiceNumber}</p>
                        <p className="text-xs text-ink-3 mt-0.5">{formatDate(inv.issueDate || inv.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold tabular text-ink">{formatCurrency(inv.grandTotal)}</span>
                        <Badge tone={STATUS_TONE[inv.status] ?? 'neutral'}>{inv.status}</Badge>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-6 pb-4">
                        <div className="rounded-control border border-border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-surface-2 border-b border-border">
                                <th className="text-left px-4 py-2 text-xs text-ink-3 font-medium">Item</th>
                                <th className="text-right px-4 py-2 text-xs text-ink-3 font-medium">Qty</th>
                                <th className="text-right px-4 py-2 text-xs text-ink-3 font-medium">Unit Price</th>
                                <th className="text-right px-4 py-2 text-xs text-ink-3 font-medium">Tax</th>
                                <th className="text-right px-4 py-2 text-xs text-ink-3 font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {(inv.items || []).map((item, i) => (
                                <tr key={i}>
                                  <td className="px-4 py-2 text-ink-2">{item.description}</td>
                                  <td className="px-4 py-2 text-right text-ink-3">{item.quantity}</td>
                                  <td className="px-4 py-2 text-right tabular text-ink-3">{formatCurrency(item.unitPrice)}</td>
                                  <td className="px-4 py-2 text-right tabular text-ink-3">{formatCurrency(item.taxAmount)}</td>
                                  <td className="px-4 py-2 text-right tabular text-ink font-medium">{formatCurrency(item.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {inv.notes && <p className="text-xs text-ink-3 mt-2">{inv.notes}</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
