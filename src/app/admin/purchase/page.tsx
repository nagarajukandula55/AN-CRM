'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  Plus,
  X,
  ShoppingBag,
  CheckCircle,
  Clock,
  DollarSign,
  Trash2,
} from 'lucide-react'

interface PurchaseOrder {
  _id: string
  poNumber: string
  vendorName: string
  totalAmount: number
  status: string
  deliveryDate?: string
  createdAt: string
  items?: { description: string; qty: number; price: number }[]
}

interface POItem {
  description: string
  qty: number
  price: number
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-500',
  SUBMITTED: 'bg-blue-500/20 text-blue-400',
  APPROVED: 'bg-green-500/20 text-green-400',
  REJECTED: 'bg-red-500/20 text-red-400',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export default function PurchasePage() {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [vendorName, setVendorName] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<POItem[]>([{ description: '', qty: 1, price: 0 }])

  const { data: posData, isLoading: loading, error: fetchErr, mutate: fetchPOs } = useSWR('/api/purchase/orders')
  const pos: PurchaseOrder[] = posData ? (Array.isArray(posData) ? posData : (posData.orders ?? [])) : []
  const error = fetchErr ? 'Failed to load purchase orders' : null

  function addItem() {
    setItems((p) => [...p, { description: '', qty: 1, price: 0 }])
  }

  function removeItem(idx: number) {
    setItems((p) => p.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof POItem, value: string | number) {
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/purchase/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorName, deliveryDate, notes, items }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.message ?? 'Failed to create purchase order')
      }
      setShowForm(false)
      setVendorName('')
      setDeliveryDate('')
      setNotes('')
      setItems([{ description: '', qty: 1, price: 0 }])
      fetchPOs()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const totalValue = pos.reduce((s, p) => s + (p.totalAmount ?? 0), 0)
  const approved = pos.filter((p) => p.status === 'APPROVED').length
  const pending = pos.filter((p) => ['DRAFT', 'SUBMITTED'].includes(p.status)).length

  if (loading && pos.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/admin')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Purchase Orders</h1>
            <p className="text-sm text-gray-400">Manage procurement and vendor orders</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto flex items-center gap-2 bg-gray-900 text-gray-900 text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-800 transition"
          >
            <Plus className="w-4 h-4" /> New PO
          </button>
        </div>

        {error && (
          <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: ShoppingBag, label: 'Total POs', value: String(pos.length) },
            { icon: CheckCircle, label: 'Approved', value: String(approved) },
            { icon: Clock, label: 'Pending', value: String(pending) },
            { icon: DollarSign, label: 'Total Value', value: fmt(totalValue) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-500 text-sm">{label}</span>
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-gray-700" />
                </div>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* PO Table */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-6 py-3 text-gray-400 font-medium">PO #</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Vendor</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Date</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Delivery</th>
                <th className="text-right px-6 py-3 text-gray-400 font-medium">Amount</th>
                <th className="text-center px-6 py-3 text-gray-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                    No purchase orders found
                  </td>
                </tr>
              ) : (
                pos.map((po) => (
                  <tr key={po._id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3 font-medium text-gray-900">{po.poNumber}</td>
                    <td className="px-6 py-3 text-gray-700">{po.vendorName}</td>
                    <td className="px-6 py-3 text-gray-400">{fmtDate(po.createdAt)}</td>
                    <td className="px-6 py-3 text-gray-400">
                      {po.deliveryDate ? fmtDate(po.deliveryDate) : '—'}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-900">{fmt(po.totalAmount)}</td>
                    <td className="px-6 py-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[po.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {po.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal: New Purchase Order */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[90vh] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">New Purchase Order</h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              {formError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Vendor Name *</label>
                <input
                  required
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-white/20"
                  placeholder="Supplier Ltd."
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Delivery Date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  title="Select delivery date"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-white/20"
                />
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-500">Items</label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 transition"
                  >
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                </div>
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Item {idx + 1}</span>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-gray-400 hover:text-red-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <input
                        value={item.description}
                        onChange={(e) => updateItem(idx, 'description', e.target.value)}
                        placeholder="Description"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-white/20"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Qty</label>
                          <input
                            type="number"
                            min={1}
                            value={item.qty}
                            onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 1)}
                            onFocus={(e) => e.target.select()}
                            placeholder="Qty"
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Price</label>
                          <input
                            type="number"
                            min={0}
                            value={item.price}
                            onChange={(e) => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            placeholder="Price"
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Additional notes"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-white/20 resize-none"
                />
              </div>
            </form>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-500 hover:text-gray-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Create PO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
