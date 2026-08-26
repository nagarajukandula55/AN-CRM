'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'

interface ExpenseRow {
  _id: string
  date: string
  category: string
  description?: string
  amount: number
  paymentMode: string
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
}
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const PAYMENT_MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER']

export default function VendorExpensesPage() {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [fromDate, setFromDate] = useState(firstOfMonth.toISOString().split('T')[0])
  const [toDate, setToDate] = useState(today.toISOString().split('T')[0])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ date: today.toISOString().split('T')[0], category: '', description: '', amount: '', paymentMode: 'CASH' })

  const params = new URLSearchParams({ from: fromDate, to: toDate }).toString()
  const { data: json, isLoading: loading, error: swrError, mutate } = useSWR(`/api/vendor/expenses?${params}`, { keepPreviousData: true })
  const expenses: ExpenseRow[] = json?.success ? json.expenses : []
  const categories: string[] = json?.categories || []
  const total: number = json?.success ? json.total : 0
  const error = swrError ? 'Failed to load expenses' : json && !json.success ? json.message || 'Failed to load expenses' : ''

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.category) {
      setFormError('Category is required')
      return
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setFormError('Amount must be a positive number')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/vendor/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      const data = await res.json()
      if (!data.success) {
        setFormError(data.message || 'Failed to add expense')
        return
      }
      setForm({ date: today.toISOString().split('T')[0], category: '', description: '', amount: '', paymentMode: 'CASH' })
      setShowForm(false)
      mutate()
    } catch {
      setFormError('Failed to add expense')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/vendor/expenses/${id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vendor Portal"
        title="Expenses"
        description="Track rent, salaries, and other shop running costs — feeds your Profit & Loss report."
        actions={<Button onClick={() => setShowForm((s) => !s)} icon={<Plus className="h-4 w-4" />}>Add Expense</Button>}
      />

      {showForm && (
        <Card className="p-5">
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            {formError && (
              <div className="lg:col-span-5 flex items-center gap-2 rounded-control border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" /> {formError}
              </div>
            )}
            <Field label="Date" required>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Category" required>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" required>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </Field>
            <Field label="Payment Mode">
              <Select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m.replace('_', ' ')}</option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={saving} disabled={saving}>Save</Button>
            <div className="sm:col-span-2 lg:col-span-5">
              <Field label="Description">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes" />
              </Field>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-4">
        <p className="eyebrow mb-3">Date Range</p>
        <div className="flex items-center gap-3 flex-wrap">
          <Field label="From" className="w-auto">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label="To" className="w-auto">
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
          <div className="ml-auto text-right">
            <p className="text-xs text-ink-3">Total in range</p>
            <p className="tabular text-lg font-bold text-danger">{formatCurrency(total)}</p>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="h-section">Expense Entries</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size={24} /></div>
        ) : error ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-danger mx-auto mb-2" />
              <p className="text-ink-3">{error}</p>
            </div>
          </div>
        ) : expenses.length === 0 ? (
          <EmptyState kind="empty" title="No expenses recorded in this period" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Date</th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Category</th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3 hidden md:table-cell">Description</th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3 hidden sm:table-cell">Mode</th>
                <th className="px-5 py-3 text-right text-[10px] uppercase tracking-wider text-ink-3">Amount</th>
                <th className="px-5 py-3 text-right text-[10px] uppercase tracking-wider text-ink-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map((e) => (
                <tr key={e._id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-5 py-3 text-sm text-ink-3">{formatDate(e.date)}</td>
                  <td className="px-5 py-3 text-sm text-ink">{e.category}</td>
                  <td className="px-5 py-3 text-sm text-ink-3 hidden md:table-cell max-w-xs truncate">{e.description || '—'}</td>
                  <td className="px-5 py-3 text-sm text-ink-3 hidden sm:table-cell">{e.paymentMode?.replace('_', ' ')}</td>
                  <td className="px-5 py-3 text-sm tabular text-right font-medium text-danger">{formatCurrency(e.amount)}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleDelete(e._id)} className="text-ink-3 hover:text-danger" aria-label="Delete expense">
                      <Trash2 className="h-4 w-4" />
                    </button>
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
