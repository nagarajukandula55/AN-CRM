'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  X,
  ShoppingCart,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Trash2,
  Printer,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Field, Input, Textarea } from '@/components/ui/Input'

interface OrderItem {
  description: string
  qty: number
  price: number
}

interface Order {
  _id: string
  orderNumber: string
  customerName: string
  customerEmail?: string
  totalAmount: number
  status: string
  createdAt: string
  items?: OrderItem[]
}

const STATUS_TABS = ['ALL', 'DRAFT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  CONFIRMED: 'info',
  PROCESSING: 'warning',
  SHIPPED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'danger',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export default function OrdersPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    notes: '',
  })
  const [items, setItems] = useState<OrderItem[]>([{ description: '', qty: 1, price: 0 }])

  const { data: ordersData, isLoading: loading, error: fetchErr, mutate: fetchOrders } = useSWR('/api/sales/orders')
  const orders: Order[] = ordersData ? (Array.isArray(ordersData) ? ordersData : (ordersData.orders ?? [])) : []
  const error = fetchErr ? 'Failed to load orders' : null

  async function updateStatus(id: string, newStatus: string) {
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/sales/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        fetchOrders()
      }
    } catch {
      // silently fail
    } finally {
      setUpdatingId(null)
    }
  }

  function addItem() {
    setItems((p) => [...p, { description: '', qty: 1, price: 0 }])
  }

  function removeItem(idx: number) {
    setItems((p) => p.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof OrderItem, value: string | number) {
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/sales/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, items }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.message ?? 'Failed to create order')
      }
      setShowForm(false)
      setForm({ customerName: '', customerEmail: '', notes: '' })
      setItems([{ description: '', qty: 1, price: 0 }])
      fetchOrders()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const total = orders.length
  const processing = orders.filter((o) => o.status === 'PROCESSING').length
  const shipped = orders.filter((o) => o.status === 'SHIPPED').length
  const delivered = orders.filter((o) => o.status === 'DELIVERED').length
  const cancelled = orders.filter((o) => o.status === 'CANCELLED').length

  const filtered = orders.filter((o) => statusFilter === 'ALL' || o.status === statusFilter)

  const nextStatus: Record<string, string> = {
    DRAFT: 'CONFIRMED',
    CONFIRMED: 'PROCESSING',
    PROCESSING: 'SHIPPED',
    SHIPPED: 'DELIVERED',
  }

  if (loading && orders.length === 0) {
    return <LoadingPanel label="Loading orders…" />
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Orders"
          description="Customer order management"
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => router.push('/console')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
              <Button onClick={() => setShowForm(true)} icon={<Plus className="w-4 h-4" />}>New Order</Button>
            </>
          }
        />

        {error && (
          <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {[
            { icon: ShoppingCart, label: 'Total', value: String(total) },
            { icon: Package, label: 'Processing', value: String(processing) },
            { icon: Truck, label: 'Shipped', value: String(shipped) },
            { icon: CheckCircle, label: 'Delivered', value: String(delivered) },
            { icon: XCircle, label: 'Cancelled', value: String(cancelled) },
          ].map(({ icon: Icon, label, value }) => (
            <Card key={label} className="p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-ink-3 text-sm">{label}</span>
                <div className="w-8 h-8 rounded-control bg-accent-soft flex items-center justify-center">
                  <Icon className="w-4 h-4 text-accent" />
                </div>
              </div>
              <p className="tabular text-2xl font-semibold text-ink">{value}</p>
            </Card>
          ))}
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 flex-wrap mb-6">
          {STATUS_TABS.map((s) => (
            <Button key={s} variant={statusFilter === s ? 'primary' : 'secondary'} size="sm" onClick={() => setStatusFilter(s)}>
              {s}
            </Button>
          ))}
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Order #</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Customer</th>
                  <th className="text-center px-6 py-3 text-ink-3 font-medium">Items</th>
                  <th className="text-right px-6 py-3 text-ink-3 font-medium">Amount</th>
                  <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Date</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState kind="empty" title="No orders found" /></td></tr>
                ) : (
                  filtered.map((ord) => (
                    <tr key={ord._id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-6 py-3 font-medium text-ink">{ord.orderNumber}</td>
                      <td className="px-6 py-3 text-ink-2">{ord.customerName}</td>
                      <td className="px-6 py-3 text-center text-ink-3">{ord.items?.length ?? 0}</td>
                      <td className="px-6 py-3 text-right tabular text-ink">{fmt(ord.totalAmount)}</td>
                      <td className="px-6 py-3 text-center">
                        <Badge tone={STATUS_TONE[ord.status] ?? 'neutral'}>{ord.status}</Badge>
                      </td>
                      <td className="px-6 py-3 text-ink-3">{fmtDate(ord.createdAt)}</td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/console/orders/${ord._id}/print`}
                            target="_blank"
                            title="Print"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-control text-ink-3 hover:text-ink hover:bg-surface-2"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Link>
                          {nextStatus[ord.status] && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => updateStatus(ord._id, nextStatus[ord.status])}
                              disabled={updatingId === ord._id}
                              loading={updatingId === ord._id}
                            >
                              → {nextStatus[ord.status]}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Create / Edit Modal: New Order */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg max-h-[90vh] bg-surface border border-border rounded-card overflow-hidden shadow-card-lg flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="h-section">New Order</h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-control bg-surface border border-border-strong flex items-center justify-center hover:bg-surface-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              {formError && (
                <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">
                  {formError}
                </div>
              )}
              <Field label="Customer Name" required>
                <Input
                  required
                  value={form.customerName}
                  onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                  placeholder="Acme Corp"
                />
              </Field>
              <Field label="Customer Email">
                <Input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => setForm((p) => ({ ...p, customerEmail: e.target.value }))}
                  placeholder="customer@example.com"
                />
              </Field>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-ink-2">Order Items</label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="text-xs text-ink-3 hover:text-ink flex items-center gap-1 transition"
                  >
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                </div>
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="rounded-control border border-border bg-surface p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink-3">Item {idx + 1}</span>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-ink-3 hover:text-danger transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(idx, 'description', e.target.value)}
                        placeholder="Product / Description"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Qty">
                          <Input
                            type="number"
                            min={1}
                            value={item.qty}
                            onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 1)}
                            onFocus={(e) => e.target.select()}
                            placeholder="Quantity"
                          />
                        </Field>
                        <Field label="Price">
                          <Input
                            type="number"
                            min={0}
                            value={item.price}
                            onChange={(e) => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            placeholder="Unit price"
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Field label="Notes">
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  placeholder="Additional notes about this order..."
                />
              </Field>
            </form>
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} loading={submitting} className="flex-1">
                Create Order
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
