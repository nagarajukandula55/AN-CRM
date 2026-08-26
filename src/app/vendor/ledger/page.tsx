'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { Field, Input } from '@/components/ui/Input'

interface PartySummary {
  key: string
  name: string
  phone?: string
  balance: number
}
interface LedgerTx {
  date: string
  type: 'Invoice' | 'Payment' | 'Credit Note' | 'Debit Note'
  reference: string
  description: string
  amount: number
  balance: number
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
}
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const TYPE_TONE: Record<string, Tone> = {
  Invoice: 'info',
  Payment: 'success',
  'Credit Note': 'warning',
  'Debit Note': 'danger',
}

export default function VendorLedgerPage() {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [fromDate, setFromDate] = useState(firstOfMonth.toISOString().split('T')[0])
  const [toDate, setToDate] = useState(today.toISOString().split('T')[0])
  const [selectedParty, setSelectedParty] = useState<string | null>(null)

  const rangeParams = new URLSearchParams({ from: fromDate, to: toDate }).toString()

  const { data: listJson, isLoading: listLoading, error: listErr } = useSWR(
    !selectedParty ? `/api/vendor/ledger?${rangeParams}` : null,
    { keepPreviousData: true }
  )
  const parties: PartySummary[] = listJson?.success ? listJson.parties : []

  const { data: detailJson, isLoading: detailLoading, error: detailErr } = useSWR(
    selectedParty ? `/api/vendor/ledger?${rangeParams}&customer=${encodeURIComponent(selectedParty)}` : null,
    { keepPreviousData: true }
  )
  const transactions: LedgerTx[] = detailJson?.success ? detailJson.transactions : []
  const party = detailJson?.success ? detailJson.party : null
  const closingBalance = detailJson?.success ? detailJson.closingBalance : 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vendor Portal"
        title="Ledger Book"
        description="Party-wise running balance across invoices, payments, and credit/debit notes."
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

      {!selectedParty ? (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="h-section">Customers</h2>
            <p className="text-xs text-ink-3 mt-0.5">Click a customer to view their full ledger.</p>
          </div>
          {listLoading ? (
            <div className="flex items-center justify-center py-16"><Spinner size={24} /></div>
          ) : listErr ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center"><AlertCircle className="h-8 w-8 text-danger mx-auto mb-2" /><p className="text-ink-3">Failed to load ledger</p></div>
            </div>
          ) : parties.length === 0 ? (
            <EmptyState kind="empty" title="No customer transactions in this period" />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Customer</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3 hidden sm:table-cell">Phone</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase tracking-wider text-ink-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parties.map((p) => (
                  <tr key={p.key} className="hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => setSelectedParty(p.key)}>
                    <td className="px-5 py-3 text-sm text-ink font-medium">{p.name}</td>
                    <td className="px-5 py-3 text-sm text-ink-3 hidden sm:table-cell">{p.phone || '—'}</td>
                    <td className={`px-5 py-3 text-sm tabular text-right font-medium ${p.balance > 0 ? 'text-danger' : 'text-success'}`}>
                      {formatCurrency(p.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : (
        <>
          <button onClick={() => setSelectedParty(null)} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to all customers
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-4">
              <p className="text-xs text-ink-3">Customer</p>
              <p className="text-lg font-bold text-ink">{party?.name || '—'}</p>
              <p className="text-xs text-ink-3">{party?.phone || ''}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-3">Closing Balance</p>
              <p className={`tabular text-xl font-bold ${closingBalance > 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(closingBalance)}</p>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="h-section">Transactions</h2>
            </div>
            {detailLoading ? (
              <div className="flex items-center justify-center py-16"><Spinner size={24} /></div>
            ) : detailErr ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center"><AlertCircle className="h-8 w-8 text-danger mx-auto mb-2" /><p className="text-ink-3">Failed to load ledger</p></div>
              </div>
            ) : transactions.length === 0 ? (
              <EmptyState kind="empty" title="No transactions in this period" />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Date</th>
                    <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Type</th>
                    <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Reference</th>
                    <th className="px-5 py-3 text-right text-[10px] uppercase tracking-wider text-ink-3">Amount</th>
                    <th className="px-5 py-3 text-right text-[10px] uppercase tracking-wider text-ink-3">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx, idx) => (
                    <tr key={idx} className="hover:bg-surface-2 transition-colors">
                      <td className="px-5 py-3 text-sm text-ink-3">{formatDate(tx.date)}</td>
                      <td className="px-5 py-3"><Badge tone={TYPE_TONE[tx.type] ?? 'neutral'}>{tx.type}</Badge></td>
                      <td className="px-5 py-3 text-sm tabular text-ink-2">{tx.reference}</td>
                      <td className={`px-5 py-3 text-sm tabular text-right font-medium ${tx.amount >= 0 ? 'text-info' : 'text-success'}`}>
                        {tx.amount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                      </td>
                      <td className="px-5 py-3 text-sm text-right text-ink tabular">{formatCurrency(tx.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
