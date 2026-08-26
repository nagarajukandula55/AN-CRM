'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { TrendingUp, TrendingDown, Wallet, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { Field, Input } from '@/components/ui/Input'

interface PLData {
  revenue: number
  cogs: number
  grossProfit: number
  expenses: number
  expenseByCategory: Record<string, number>
  netProfit: number
  invoiceCount: number
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
}

export default function VendorProfitLossPage() {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [fromDate, setFromDate] = useState(firstOfMonth.toISOString().split('T')[0])
  const [toDate, setToDate] = useState(today.toISOString().split('T')[0])

  const params = new URLSearchParams({ from: fromDate, to: toDate }).toString()
  const { data: json, isLoading: loading, error: swrError } = useSWR(`/api/vendor/profit-loss?${params}`, { keepPreviousData: true })
  const data: PLData | null = json?.success ? json : null
  const error = swrError ? 'Failed to load Profit & Loss' : json && !json.success ? json.message || 'Failed to load Profit & Loss' : ''

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vendor Portal"
        title="Profit &amp; Loss"
        description="Cash-basis P&L: revenue billed, material cost consumed, and shop expenses for the period."
      />

      <Card className="p-4">
        <p className="eyebrow mb-3">Date Range</p>
        <div className="flex items-center gap-3 flex-wrap">
          <Field label="From" className="w-auto">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label="To" className="w-auto">
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner size={24} /></div>
      ) : error ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center"><AlertCircle className="h-8 w-8 text-danger mx-auto mb-2" /><p className="text-ink-3">{error}</p></div>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-ink-3">Revenue</p>
                <div className="h-7 w-7 rounded-control bg-info-soft flex items-center justify-center">
                  <TrendingUp className="h-3.5 w-3.5 text-info" />
                </div>
              </div>
              <p className="tabular text-xl font-bold text-ink">{formatCurrency(data.revenue)}</p>
              <p className="text-[10px] text-ink-3 mt-1">{data.invoiceCount} invoice{data.invoiceCount === 1 ? '' : 's'}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-ink-3">Material Cost (COGS)</p>
                <div className="h-7 w-7 rounded-control bg-warning-soft flex items-center justify-center">
                  <TrendingDown className="h-3.5 w-3.5 text-warning" />
                </div>
              </div>
              <p className="tabular text-xl font-bold text-ink">{formatCurrency(data.cogs)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-ink-3">Expenses</p>
                <div className="h-7 w-7 rounded-control bg-danger-soft flex items-center justify-center">
                  <Wallet className="h-3.5 w-3.5 text-danger" />
                </div>
              </div>
              <p className="tabular text-xl font-bold text-ink">{formatCurrency(data.expenses)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-ink-3">Net Profit</p>
                <div className={`h-7 w-7 rounded-control flex items-center justify-center ${data.netProfit >= 0 ? 'bg-success-soft' : 'bg-danger-soft'}`}>
                  {data.netProfit >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-success" /> : <TrendingDown className="h-3.5 w-3.5 text-danger" />}
                </div>
              </div>
              <p className={`tabular text-xl font-bold ${data.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(data.netProfit)}</p>
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="h-section mb-4">Statement</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5">
                <span className="text-ink-2">Revenue</span>
                <span className="tabular text-ink font-medium">{formatCurrency(data.revenue)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-t border-border">
                <span className="text-ink-2">Less: Material Cost (COGS)</span>
                <span className="tabular text-ink font-medium">({formatCurrency(data.cogs)})</span>
              </div>
              <div className="flex justify-between py-1.5 border-t border-border-strong font-semibold">
                <span className="text-ink">Gross Profit</span>
                <span className="tabular text-ink">{formatCurrency(data.grossProfit)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-t border-border">
                <span className="text-ink-2">Less: Expenses</span>
                <span className="tabular text-ink font-medium">({formatCurrency(data.expenses)})</span>
              </div>
              <div className="flex justify-between py-2 border-t-2 border-border-strong font-bold text-base">
                <span className="text-ink">Net Profit</span>
                <span className={`tabular ${data.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(data.netProfit)}</span>
              </div>
            </div>
          </Card>

          {data.expenses > 0 && (
            <Card className="p-5">
              <h2 className="h-section mb-4">Expenses by Category</h2>
              <div className="space-y-2">
                {Object.entries(data.expenseByCategory)
                  .filter(([, amt]) => amt > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between text-sm py-1">
                      <span className="text-ink-2">{cat}</span>
                      <span className="tabular text-ink">{formatCurrency(amt)}</span>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          <p className="text-xs text-ink-3">
            Cash-basis figures for the selected period only — not a statutory financial statement (no accruals, depreciation, or trial balance). For filing/audit purposes, use this alongside your accountant's books.
          </p>
        </>
      ) : null}
    </div>
  )
}
