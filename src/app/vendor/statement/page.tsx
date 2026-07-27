'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  FileText,
  Download,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  CreditCard,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { Field, Input } from '@/components/ui/Input'

interface Transaction {
  date: string
  type: 'Invoice' | 'Payment' | 'Credit'
  reference: string
  description: string
  amount: number
  balance: number
}

interface StatementSummary {
  totalInvoiced: number
  totalPaid: number
  outstanding: number
  creditBalance: number
}

interface StatementData {
  transactions: Transaction[]
  summary: StatementSummary
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
const TYPE_TONE: Record<string, Tone> = {
  Invoice: 'info',
  Payment: 'success',
  Credit: 'warning',
}

export default function VendorStatementPage() {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const [fromDate, setFromDate] = useState(
    firstOfMonth.toISOString().split('T')[0]
  )
  const [toDate, setToDate] = useState(today.toISOString().split('T')[0])

  const statementParams = fromDate && toDate ? new URLSearchParams({ from: fromDate, to: toDate }).toString() : null
  const { data: json, isLoading: loading, error: swrError, mutate: fetchStatement } = useSWR(
    statementParams ? `/api/vendor/statement?${statementParams}` : null,
    { keepPreviousData: true }
  )
  const data: StatementData | null = json?.success ? json.data : null
  const error = swrError ? 'Failed to load statement' : (json && !json.success ? (json.message || 'Failed to load statement') : '')

  const handleDownloadPDF = () => {
    window.print()
  }

  const summary = data?.summary
  const transactions = data?.transactions || []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vendor Portal"
        title="Financial Statement"
        actions={<Button onClick={handleDownloadPDF} icon={<Download className="h-4 w-4" />}>Download PDF</Button>}
      />

      {/* Date Range Picker */}
      <Card className="p-4">
        <p className="eyebrow mb-3">Date Range</p>
        <div className="flex items-center gap-3 flex-wrap">
          <Field label="From" className="w-auto">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label="To" className="w-auto">
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={fetchStatement} disabled={loading} loading={loading} className="self-end">
            Apply
          </Button>
        </div>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-ink-3">Total Invoiced</p>
              <div className="h-7 w-7 rounded-control bg-accent-soft flex items-center justify-center">
                <FileText className="h-3.5 w-3.5 text-accent" />
              </div>
            </div>
            <p className="tabular text-xl font-bold text-ink">{formatCurrency(summary.totalInvoiced)}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-ink-3">Total Paid</p>
              <div className="h-7 w-7 rounded-control bg-success-soft flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5 text-success" />
              </div>
            </div>
            <p className="tabular text-xl font-bold text-ink">{formatCurrency(summary.totalPaid)}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-ink-3">Outstanding</p>
              <div className="h-7 w-7 rounded-control bg-danger-soft flex items-center justify-center">
                <TrendingDown className="h-3.5 w-3.5 text-danger" />
              </div>
            </div>
            <p className="tabular text-xl font-bold text-ink">{formatCurrency(summary.outstanding)}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-ink-3">Credit Balance</p>
              <div className="h-7 w-7 rounded-control bg-warning-soft flex items-center justify-center">
                <CreditCard className="h-3.5 w-3.5 text-warning" />
              </div>
            </div>
            <p className="tabular text-xl font-bold text-ink">{formatCurrency(summary.creditBalance)}</p>
          </Card>
        </div>
      )}

      {/* Transactions Table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="h-section">Transactions</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            {fromDate && toDate
              ? `${formatDate(fromDate)} — ${formatDate(toDate)}`
              : 'All transactions'}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={24} />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-danger mx-auto mb-2" />
              <p className="text-ink-3">{error}</p>
            </div>
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState kind="empty" title="No transactions in this period" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">
                  Date
                </th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">
                  Type
                </th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">
                  Reference
                </th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3 hidden md:table-cell">
                  Description
                </th>
                <th className="px-5 py-3 text-right text-[10px] uppercase tracking-wider text-ink-3">
                  Amount
                </th>
                <th className="px-5 py-3 text-right text-[10px] uppercase tracking-wider text-ink-3">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((tx, idx) => (
                <tr key={idx} className="hover:bg-surface-2 transition-colors">
                  <td className="px-5 py-3 text-sm text-ink-3">
                    {formatDate(tx.date)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={TYPE_TONE[tx.type] ?? 'neutral'}>{tx.type}</Badge>
                  </td>
                  <td className="px-5 py-3 text-sm tabular text-ink-2">
                    {tx.reference}
                  </td>
                  <td className="px-5 py-3 text-sm text-ink-3 hidden md:table-cell max-w-xs truncate">
                    {tx.description}
                  </td>
                  <td
                    className={`px-5 py-3 text-sm tabular text-right font-medium ${
                      tx.type === 'Invoice' ? 'text-info' : 'text-success'
                    }`}
                  >
                    {tx.type !== 'Payment' ? '+' : '-'}
                    {formatCurrency(Math.abs(tx.amount))}
                  </td>
                  <td className="px-5 py-3 text-sm text-right text-ink tabular">
                    {formatCurrency(tx.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
