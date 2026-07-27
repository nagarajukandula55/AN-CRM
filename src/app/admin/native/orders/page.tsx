'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  Search,
  ShoppingCart,
  IndianRupee,
  Truck,
  CheckCircle,
  X,
} from 'lucide-react'

interface OrderRow {
  _id: string
  orderId: string
  amount: number
  status: string
  createdAt: string
  address?: { name?: string; phone?: string; city?: string; state?: string }
  payment?: { status?: string; method?: string }
  shipping?: { awbNumber?: string; trackingStatus?: string; courierPartner?: string }
  invoice?: { invoiceNumber?: string }
  customerType?: 'RETAIL' | 'BUSINESS'
  isBulkOrder?: boolean
  billingRevision?: {
    status?: 'PENDING' | 'SHARED'
    revisedAmount?: number
    revisedShippingCharges?: number
    notes?: string
    revisedAt?: string
  }
}

const STATUS_OPTIONS = [
  'CREATED', 'PENDING_PAYMENT', 'PENDING_REVIEW', 'BILLING_REVISED', 'PAID', 'PROCESSING', 'PACKED',
  'DISPATCHED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'RETURNED', 'REFUNDED',
]

const statusColors: Record<string, string> = {
  CREATED: 'bg-gray-100 text-gray-500',
  PENDING_PAYMENT: 'bg-yellow-500/20 text-yellow-600',
  PENDING_REVIEW: 'bg-amber-500/20 text-amber-700',
  BILLING_REVISED: 'bg-teal-500/20 text-teal-700',
  PAID: 'bg-blue-500/20 text-blue-600',
  PROCESSING: 'bg-indigo-500/20 text-indigo-600',
  PACKED: 'bg-purple-500/20 text-purple-600',
  DISPATCHED: 'bg-cyan-500/20 text-cyan-600',
  DELIVERED: 'bg-green-500/20 text-green-600',
  COMPLETED: 'bg-green-600/20 text-green-700',
  FAILED: 'bg-red-500/20 text-red-500',
  PAYMENT_FAILED: 'bg-red-500/20 text-red-500',
  CANCELLED: 'bg-red-500/20 text-red-500',
  RETURNED: 'bg-orange-500/20 text-orange-600',
  REFUNDED: 'bg-gray-200 text-gray-600',
  EXPIRED: 'bg-gray-200 text-gray-500',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export default function NativeOrdersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<OrderRow | null>(null)
  const [revisedAmount, setRevisedAmount] = useState('')
  const [revisedShipping, setRevisedShipping] = useState('')
  const [revisionNotes, setRevisionNotes] = useState('')
  const [revisionSubmitting, setRevisionSubmitting] = useState(false)

  const { data: ordersRes, isLoading: loading, mutate: fetchOrders, error: ordersError } = useSWR(
    '/api/orders/list?limit=200'
  )
  const orders: OrderRow[] = ordersRes?.success ? ordersRes.orders || [] : []
  const error: string | null = ordersError ? (ordersError.message || 'Failed to connect') : null

  useEffect(() => {
    setRevisedAmount(selected?.billingRevision?.revisedAmount != null ? String(selected.billingRevision.revisedAmount) : '')
    setRevisedShipping(selected?.billingRevision?.revisedShippingCharges != null ? String(selected.billingRevision.revisedShippingCharges) : '')
    setRevisionNotes(selected?.billingRevision?.notes || '')
  }, [selected])

  async function updateStatus(orderId: string, status: string) {
    setBusyId(orderId)
    try {
      const res = await fetch('/api/admin/orders/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [orderId], status }),
      })
      const d = await res.json()
      const result = d.results?.[0]
      if (!result?.success) {
        alert(result?.message || 'Failed to update status')
      }
      fetchOrders()
    } catch {
      alert('Failed to connect')
    } finally {
      setBusyId(null)
    }
  }

  async function markPaid(orderId: string) {
    setBusyId(orderId)
    try {
      const res = await fetch('/api/orders/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, mode: 'MANUAL' }),
      })
      const d = await res.json()
      if (!d.success) {
        alert(d.message || 'Failed to mark paid')
      }
      fetchOrders()
    } catch {
      alert('Failed to connect')
    } finally {
      setBusyId(null)
    }
  }

  async function submitBillingRevision(orderId: string) {
    if (!revisedAmount || isNaN(Number(revisedAmount))) {
      alert('Enter a valid revised amount')
      return
    }
    setRevisionSubmitting(true)
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/billing-revision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revisedAmount: Number(revisedAmount),
          revisedShippingCharges: Number(revisedShipping || 0),
          notes: revisionNotes,
        }),
      })
      const d = await res.json()
      if (!d.success) {
        alert(d.message || 'Failed to share revised billing')
        return
      }
      setSelected(null)
      fetchOrders()
    } catch {
      alert('Failed to connect')
    } finally {
      setRevisionSubmitting(false)
    }
  }

  const filtered = orders.filter((o) => {
    const matchSearch =
      !search ||
      o.orderId?.toLowerCase().includes(search.toLowerCase()) ||
      o.address?.name?.toLowerCase().includes(search.toLowerCase()) ||
      o.address?.phone?.includes(search)
    const matchStatus = statusFilter === 'ALL' || o.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalRevenue = orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'FAILED').reduce((s, o) => s + (o.amount || 0), 0)
  const paidCount = orders.filter((o) => o.status === 'PAID' || o.status === 'COMPLETED' || o.status === 'DELIVERED').length
  const pendingCount = orders.filter((o) => o.status === 'CREATED' || o.status === 'PENDING_PAYMENT').length

  if (loading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="px-6 py-10">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/admin/native')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Native Orders</h1>
            <p className="text-sm text-gray-500">Customer orders placed through the Native storefront</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {[
            { icon: ShoppingCart, label: 'Total Orders', value: String(orders.length) },
            { icon: IndianRupee, label: 'Revenue', value: fmt(totalRevenue) },
            { icon: CheckCircle, label: 'Paid / Fulfilled', value: String(paidCount) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-500 text-sm">{label}</span>
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-gray-600" />
                </div>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search order id, name, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {['ALL', ...STATUS_OPTIONS].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  statusFilter === s ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:text-gray-900 border border-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Order ID</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Customer</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Amount</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Payment</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Shipping</th>
                <th className="text-center px-6 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Date</th>
                <th className="text-center px-6 py-3 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gray-500">
                    No orders found
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o._id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3 font-mono text-xs text-gray-900">
                      <button onClick={() => setSelected(o)} className="hover:underline">{o.orderId}</button>
                      {o.isBulkOrder && (
                        <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-700">
                          BULK
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-700">
                      {o.address?.name || '—'}
                      <div className="text-xs text-gray-400">{o.address?.phone}</div>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-900">{fmt(o.amount || 0)}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">
                      {o.payment?.method || '—'}
                      <div>{o.payment?.status || '—'}</div>
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">
                      {o.shipping?.awbNumber ? (
                        <>
                          <div>{o.shipping.courierPartner || 'Courier'}</div>
                          <div>{o.shipping.trackingStatus || 'PENDING'}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[o.status] || 'bg-gray-100 text-gray-500'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{fmtDate(o.createdAt)}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <select
                          value=""
                          disabled={busyId === o.orderId}
                          onChange={(e) => e.target.value && updateStatus(o.orderId, e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none"
                        >
                          <option value="">Set status…</option>
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        {o.status !== 'PAID' && o.payment?.status !== 'SUCCESS' && (
                          <button
                            onClick={() => markPaid(o.orderId)}
                            disabled={busyId === o.orderId}
                            className="text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50"
                            title="Mark paid"
                          >
                            {busyId === o.orderId ? <Loader2 className="w-3 h-3 animate-spin" /> : <IndianRupee className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">{selected.orderId}</h2>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Status</span><span>{selected.status}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Amount</span><span>{fmt(selected.amount || 0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Customer</span><span>{selected.address?.name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{selected.address?.phone || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">City / State</span><span>{selected.address?.city}, {selected.address?.state}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Payment</span><span>{selected.payment?.status} ({selected.payment?.method})</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Invoice</span><span>{selected.invoice?.invoiceNumber || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">AWB</span><span>{selected.shipping?.awbNumber || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tracking</span><span>{selected.shipping?.trackingStatus || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Placed</span><span>{fmtDate(selected.createdAt)}</span></div>

              {selected.isBulkOrder && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-semibold mb-1">Bulk order — revise billing</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    This retailer/business order ({selected.customerType || 'BUSINESS'}) is awaiting
                    revised pricing and separate shipping charges before they'll be shared and the
                    retailer notified.
                    {selected.billingRevision?.status === 'SHARED' && (
                      <span className="block mt-1 text-teal-700 font-medium">
                        Already shared{selected.billingRevision.revisedAt ? ` on ${fmtDate(selected.billingRevision.revisedAt)}` : ''} — resubmitting will update it.
                      </span>
                    )}
                  </p>
                  <div className="space-y-2">
                    <label className="block text-xs text-gray-500">Revised amount (₹)</label>
                    <input
                      type="number"
                      value={revisedAmount}
                      onChange={(e) => setRevisedAmount(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                    />
                    <label className="block text-xs text-gray-500">Shipping charges (₹, separate)</label>
                    <input
                      type="number"
                      value={revisedShipping}
                      onChange={(e) => setRevisedShipping(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                    />
                    <label className="block text-xs text-gray-500">Notes (optional, shown to retailer)</label>
                    <textarea
                      value={revisionNotes}
                      onChange={(e) => setRevisionNotes(e.target.value)}
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                    />
                    <button
                      onClick={() => submitBillingRevision(selected.orderId)}
                      disabled={revisionSubmitting}
                      className="w-full mt-1 rounded-lg bg-gray-900 text-white text-sm font-medium py-2 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {revisionSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      {selected.billingRevision?.status === 'SHARED' ? 'Update & re-share billing' : 'Share revised billing'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
