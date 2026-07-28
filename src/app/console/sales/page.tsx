'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { validateGSTIN } from '@/lib/validation/gst'
import {
  Loader2, ArrowLeft, Plus, X, Search, Eye, Trash2,
  FileText, ShoppingCart, IndianRupee, Clock,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Input } from '@/components/ui/Input'

interface Customer {
  name: string
  email?: string
  phone?: string
  address?: string
  gstin?: string
}

interface Invoice {
  _id: string
  invoiceNumber: string
  customer: Customer
  customerName?: string   // legacy fallback
  grandTotal?: number
  totalAmount?: number    // legacy fallback
  status: string
  createdAt: string
  issueDate?: string
  dueDate?: string
  supplyType?: 'INTRASTATE' | 'INTERSTATE'
  invoiceType?: 'GST' | 'NON_GST'
  cgstTotal?: number
  sgstTotal?: number
  igstTotal?: number
  subtotal?: number
  taxTotal?: number
  notes?: string
  terms?: string
  items?: Array<{
    description: string
    hsnCode?: string
    quantity: number
    unit?: string
    unitPrice: number
    taxRate: number
    lineAmount?: number
    taxAmount?: number
  }>
  businessName?: string
  discountAmount?: number
}

interface Order {
  _id: string
  orderNumber: string
  customerName: string
  totalAmount: number
  status: string
  createdAt: string
}

interface LineItem {
  description: string
  hsnCode: string
  qty: number
  unit: string
  price: number
  taxPct: number
}

type InvoiceType = 'GST' | 'NON_GST'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  PAID:       'success',
  DRAFT:      'neutral',
  SENT:       'info',
  OVERDUE:    'danger',
  CANCELLED:  'danger',
  CONFIRMED:  'info',
  PROCESSING: 'warning',
  SHIPPED:    'info',
  DELIVERED:  'success',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

const todayStr = () => new Date().toISOString().split('T')[0]

function calcGSTItems(items: LineItem[], supplyType: 'INTRASTATE' | 'INTERSTATE') {
  let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0
  const rows = items.map(item => {
    const lineAmt = (item.qty || 1) * (item.price || 0)
    const taxAmt  = lineAmt * ((item.taxPct || 0) / 100)
    subtotal += lineAmt
    if (supplyType === 'INTERSTATE') {
      igstTotal += taxAmt
    } else {
      cgstTotal += taxAmt / 2
      sgstTotal += taxAmt / 2
    }
    return { ...item, lineAmount: lineAmt, taxAmount: taxAmt }
  })
  const grandTotal = subtotal + cgstTotal + sgstTotal + igstTotal
  return { rows, subtotal, cgstTotal, sgstTotal, igstTotal, grandTotal }
}

function calcNonGSTItems(items: LineItem[]) {
  let subtotal = 0, taxTotal = 0
  const rows = items.map(item => {
    const lineAmt = (item.qty || 1) * (item.price || 0)
    const taxAmt  = lineAmt * ((item.taxPct || 0) / 100)
    subtotal += lineAmt
    taxTotal += taxAmt
    return { ...item, lineAmount: lineAmt, taxAmount: taxAmt }
  })
  const grandTotal = subtotal + taxTotal
  return { rows, subtotal, taxTotal, grandTotal }
}

export default function SalesPage() {
  const router = useRouter()
  const [tab, setTab]             = useState<'invoices' | 'orders'>('invoices')
  const [statusFilter, setStatus] = useState('ALL')
  const [search, setSearch]       = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [preview, setPreview]     = useState<Invoice | null>(null)

  // Form state
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('GST')
  const [supplyType, setSupplyType] = useState<'INTRASTATE' | 'INTERSTATE'>('INTRASTATE')
  const [customer, setCustomer]     = useState<Customer>({ name: '', email: '', phone: '', address: '', gstin: '' })
  const [notes, setNotes]           = useState('')
  const [terms, setTerms]           = useState('Payment due within 30 days.')
  const [issueDate, setIssueDate]   = useState(todayStr())
  const [dueDate, setDueDate]       = useState('')
  const [items, setItems]           = useState<LineItem[]>([
    { description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0, taxPct: 18 },
  ])
  const [discount, setDiscount]     = useState(0)

  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = meData?.activeBusinessId ?? meData?.user?.activeBusinessId ?? null
  const businessName: string = meData?.activeBusiness?.name ?? meData?.user?.activeBusiness?.name ?? meData?.businessName ?? 'Your Business'

  // Centralized customer lookup -- typing 3+ chars into Name or Phone
  // searches the shared Customer directory (/api/customers, matched
  // against name/phone/email server-side) so a returning customer's
  // details prefill instead of being retyped, and partners across the
  // business can find someone by contact number instead of hunting
  // through past invoices. Selecting a result also stops handleSubmit
  // from creating a duplicate Customer record for someone who already
  // has one -- see selectedCustomerId below.
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [showCustomerResults, setShowCustomerResults] = useState(false)
  const { data: customerSearchData } = useSWR(
    businessId && customerQuery.trim().length >= 3 ? `/api/customers?businessId=${businessId}&search=${encodeURIComponent(customerQuery.trim())}` : null
  )
  const customerResults: Array<{ _id: string; name: string; phone?: string; email?: string; address?: string }> =
    customerSearchData?.success !== false ? (customerSearchData?.customers ?? []) : []

  function selectCustomer(c: { _id: string; name: string; phone?: string; email?: string; address?: string }) {
    setCustomer(p => ({ ...p, name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || p.address }))
    setSelectedCustomerId(c._id)
    setShowCustomerResults(false)
  }

  const { data: invData, isLoading: invLoading, error: invErr, mutate: refetchInvoices } = useSWR('/api/sales/invoices')
  const invoices: Invoice[] = invData ? (Array.isArray(invData) ? invData : (invData.invoices ?? [])) : []

  const { data: ordData, isLoading: ordLoading, mutate: refetchOrders } = useSWR('/api/sales/orders')
  const orders: Order[] = ordData ? (Array.isArray(ordData) ? ordData : (ordData.orders ?? [])) : []

  const loading = invLoading || ordLoading
  const error = invErr ? 'Failed to load data' : null

  function fetchData() {
    refetchInvoices()
    refetchOrders()
  }

  function addItem() {
    setItems(p => [...p, { description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0, taxPct: invoiceType === 'GST' ? 18 : 0 }])
  }
  function removeItem(i: number) {
    setItems(p => p.filter((_, idx) => idx !== i))
  }
  function updateItem(i: number, field: keyof LineItem, value: string | number) {
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  const gstCalc    = calcGSTItems(items, supplyType)
  const nonGstCalc = calcNonGSTItems(items)
  const calc       = invoiceType === 'GST' ? gstCalc : nonGstCalc

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customer.name.trim()) { setFormError('Customer name is required'); return }
    if (customer.gstin?.trim()) {
      const result = validateGSTIN(customer.gstin)
      if (!result.valid) { setFormError(`Customer GSTIN: ${result.reason}`); return }
    }
    setSubmitting(true); setFormError(null)
    try {
      const payload: Record<string, unknown> = {
        businessId,
        customer,
        invoiceType,
        items: items.map(it => ({
          description: it.description,
          hsnCode:     it.hsnCode,
          quantity:    it.qty,
          unit:        it.unit,
          unitPrice:   it.price,
          taxRate:     it.taxPct,
        })),
        discountAmount: discount,
        notes,
        terms,
        issueDate: issueDate || todayStr(),
        dueDate:   dueDate || undefined,
        status:    'DRAFT',
      }
      if (invoiceType === 'GST') {
        payload.supplyType = supplyType
      } else {
        // Route through IGST path in API (single tax line)
        payload.supplyType = 'INTERSTATE'
      }
      const res = await fetch('/api/sales/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? d.message ?? 'Failed to create invoice')
      }
      // Keep the shared Customer directory centralized: only create a new
      // record for someone who wasn't picked from the search results above
      // (picking one means they already have a record) -- best-effort, a
      // failure here shouldn't block an invoice that already succeeded.
      if (!selectedCustomerId && customer.name.trim()) {
        fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, source: 'sales_invoice' }),
        }).catch(() => {})
      }
      setShowForm(false)
      resetForm()
      fetchData()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally { setSubmitting(false) }
  }

  function resetForm() {
    setInvoiceType('GST')
    setCustomer({ name: '', email: '', phone: '', address: '', gstin: '' })
    setCustomerQuery('')
    setSelectedCustomerId(null)
    setShowCustomerResults(false)
    setItems([{ description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0, taxPct: 18 }])
    setNotes(''); setTerms('Payment due within 30 days.')
    setIssueDate(todayStr()); setDueDate(''); setDiscount(0); setSupplyType('INTRASTATE')
  }

  const STATUSES = ['ALL', 'DRAFT', 'SENT', 'PAID', 'OVERDUE']

  const getCustomerName = (inv: Invoice) => inv.customer?.name || inv.customerName || '—'
  const getAmount       = (inv: Invoice) => inv.grandTotal ?? inv.totalAmount ?? 0
  const isGST           = (inv: Invoice) => inv.invoiceType !== 'NON_GST'

  const filteredInvoices = invoices.filter(inv => {
    const matchStatus = statusFilter === 'ALL' || inv.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !search ||
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      getCustomerName(inv).toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  const filteredOrders = orders.filter(ord =>
    !search ||
    ord.orderNumber?.toLowerCase().includes(search.toLowerCase()) ||
    ord.customerName?.toLowerCase().includes(search.toLowerCase())
  )

  const paidTotal    = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + getAmount(i), 0)
  const pendingTotal = invoices.filter(i => ['SENT','OVERDUE'].includes(i.status)).reduce((s, i) => s + getAmount(i), 0)
  const draftCount   = invoices.filter(i => i.status === 'DRAFT').length

  if (loading && invoices.length === 0 && orders.length === 0) return <LoadingPanel label="Loading sales data…" />

  return (
    <div className="min-h-screen bg-bg p-6">
      <div>

        <PageHeader
          title="Sales"
          description="Invoices, orders & GST records"
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => router.push('/console')} icon={<ArrowLeft size={15} />}>Back</Button>
              <Button onClick={() => setShowForm(true)} icon={<Plus size={15} />}>New Invoice</Button>
            </>
          }
        />

        {error && (
          <div className="mb-4 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { icon: IndianRupee, label: 'Revenue Collected', value: fmt(paidTotal), onClick: () => { setTab('invoices'); setStatus(statusFilter === 'PAID' ? 'ALL' : 'PAID') }, active: tab === 'invoices' && statusFilter === 'PAID' },
            { icon: Clock,       label: 'Pending Payments',  value: fmt(pendingTotal), onClick: null, active: false },
            { icon: FileText,    label: 'Total Invoices',    value: String(invoices.length), onClick: () => setTab('invoices'), active: tab === 'invoices' && statusFilter === 'ALL' },
            { icon: ShoppingCart,label: 'Total Orders',      value: String(orders.length), onClick: () => setTab('orders'), active: tab === 'orders' },
          ].map(({ icon: Icon, label, value, onClick, active }) => (
            <Card key={label} className={`p-5 ${onClick ? 'cursor-pointer' : 'cursor-default'} ${active ? 'border-accent ring-2 ring-accent-soft' : 'hover:border-border-strong'}`}>
              <button type="button" disabled={!onClick} onClick={onClick ?? undefined} className="text-left w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-ink-3">{label}</span>
                  <div className="w-9 h-9 rounded-control bg-accent-soft flex items-center justify-center">
                    <Icon size={16} className="text-accent" />
                  </div>
                </div>
                <p className="tabular text-xl font-bold text-ink">{value}</p>
              </button>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-border">
          {(['invoices', 'orders'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition border-b-2 -mb-px ${
                tab === t ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'
              }`}>
              {t} {t === 'invoices' ? `(${invoices.length})` : `(${orders.length})`}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input type="text" placeholder="Search by number or customer..."
              value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          {tab === 'invoices' && (
            <div className="flex gap-1">
              {STATUSES.map(s => (
                <Button key={s} variant={statusFilter === s ? 'primary' : 'secondary'} size="sm" onClick={() => setStatus(s)}>{s}</Button>
              ))}
            </div>
          )}
        </div>

        {/* Invoices Table */}
        {tab === 'invoices' && (
          <Card className="overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-3 uppercase">Invoice #</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-3 uppercase">Customer</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-3 uppercase">Date</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-ink-3 uppercase">Amount</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-ink-3 uppercase">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState kind="empty" title="No invoices found" /></td></tr>
                ) : filteredInvoices.map(inv => (
                  <tr key={inv._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{inv.invoiceNumber}</p>
                      {inv.invoiceType === 'NON_GST' && (
                        <span className="text-[10px] text-ink-3 uppercase tracking-wide">Non-GST</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-ink">{getCustomerName(inv)}</p>
                      {inv.customer?.gstin && <p className="text-xs text-ink-3 tabular">{inv.customer.gstin}</p>}
                    </td>
                    <td className="px-5 py-3 text-ink-3">{fmtDate(inv.createdAt)}</td>
                    <td className="px-5 py-3 text-right font-medium tabular text-ink">{fmt(getAmount(inv))}</td>
                    <td className="px-5 py-3 text-center">
                      <Badge tone={STATUS_TONE[inv.status] ?? 'neutral'}>{inv.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setPreview(inv)}
                        className="w-7 h-7 rounded-control bg-surface-2 flex items-center justify-center hover:bg-surface-3 transition ml-auto">
                        <Eye size={13} className="text-ink-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Orders Table */}
        {tab === 'orders' && (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-3 uppercase">Order #</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-3 uppercase">Customer</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-ink-3 uppercase">Date</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-ink-3 uppercase">Amount</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-ink-3 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredOrders.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState kind="empty" title="No orders found" /></td></tr>
                ) : filteredOrders.map(ord => (
                  <tr key={ord._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-5 py-3 font-medium text-ink">{ord.orderNumber}</td>
                    <td className="px-5 py-3 text-ink-2">{ord.customerName}</td>
                    <td className="px-5 py-3 text-ink-3">{fmtDate(ord.createdAt)}</td>
                    <td className="px-5 py-3 text-right font-medium tabular text-ink">{fmt(ord.totalAmount)}</td>
                    <td className="px-5 py-3 text-center">
                      <Badge tone={STATUS_TONE[ord.status] ?? 'neutral'}>{ord.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* ── Create / Edit Modal: New Invoice ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">New Invoice</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {invoiceType === 'GST' ? 'Compliant with Indian GST regulations' : 'Simple invoice without GST'}
                </p>
              </div>
              <button onClick={() => { setShowForm(false); resetForm() }}
                className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                <X size={14} className="text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="px-6 py-5 space-y-6">
                {formError && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{formError}</div>
                )}

                {/* Invoice Type Toggle */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">Invoice Type</label>
                  <div className="flex gap-2">
                    {(['GST', 'NON_GST'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => {
                          setInvoiceType(t)
                          if (t === 'NON_GST') {
                            setItems(p => p.map(it => ({ ...it, taxPct: 0 })))
                          } else {
                            setItems(p => p.map(it => ({ ...it, taxPct: 18 })))
                          }
                        }}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                          invoiceType === t
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                        }`}>
                        {t === 'GST' ? 'GST Invoice' : 'Non-GST Invoice'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Supply Type — GST only */}
                {invoiceType === 'GST' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">Supply Type</label>
                    <div className="flex gap-2">
                      {(['INTRASTATE', 'INTERSTATE'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setSupplyType(t)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                            supplyType === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                          }`}>
                          {t === 'INTRASTATE' ? 'Intrastate (CGST + SGST)' : 'Interstate (IGST)'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Issue Date</label>
                    <input type="date" value={issueDate}
                      onChange={e => setIssueDate(e.target.value)}
                      title="Select issue date"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Due Date</label>
                    <input type="date" value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      title="Select due date"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
                  </div>
                </div>

                {/* Customer Details */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wider">Bill To</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 relative">
                      <label className="block text-xs text-gray-500 mb-1">Company / Customer Name *</label>
                      <input required value={customer.name}
                        onChange={e => {
                          setCustomer(p => ({ ...p, name: e.target.value }))
                          setCustomerQuery(e.target.value)
                          setSelectedCustomerId(null)
                          setShowCustomerResults(true)
                        }}
                        onFocus={() => setShowCustomerResults(true)}
                        onBlur={() => setTimeout(() => setShowCustomerResults(false), 150)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                        placeholder="Acme Pvt Ltd, or search by name/phone" />
                      {showCustomerResults && customerResults.length > 0 && (
                        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                          {customerResults.map(c => (
                            <button
                              type="button"
                              key={c._id}
                              onMouseDown={() => selectCustomer(c)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                            >
                              <p className="text-gray-900 font-medium">{c.name}</p>
                              <p className="text-gray-400 text-xs">{c.phone || '—'}{c.email ? ` · ${c.email}` : ''}</p>
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedCustomerId && (
                        <p className="text-[11px] text-emerald-600 mt-1">Existing customer — details prefilled from directory.</p>
                      )}
                    </div>
                    {invoiceType === 'GST' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">GSTIN</label>
                        <input value={customer.gstin}
                          onChange={e => setCustomer(p => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                          maxLength={15}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-gray-400"
                          placeholder="22AAAAA0000A1Z5" />
                      </div>
                    )}
                    <div className="relative">
                      <label className="block text-xs text-gray-500 mb-1">Phone</label>
                      <input value={customer.phone}
                        onChange={e => {
                          setCustomer(p => ({ ...p, phone: e.target.value }))
                          setCustomerQuery(e.target.value)
                          setSelectedCustomerId(null)
                          setShowCustomerResults(true)
                        }}
                        onFocus={() => setShowCustomerResults(true)}
                        onBlur={() => setTimeout(() => setShowCustomerResults(false), 150)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                        placeholder="+91 98765 43210 — search existing" />
                      {showCustomerResults && customerResults.length > 0 && (
                        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                          {customerResults.map(c => (
                            <button
                              type="button"
                              key={c._id}
                              onMouseDown={() => selectCustomer(c)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                            >
                              <p className="text-gray-900 font-medium">{c.name}</p>
                              <p className="text-gray-400 text-xs">{c.phone || '—'}{c.email ? ` · ${c.email}` : ''}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Email</label>
                      <input type="email" value={customer.email}
                        onChange={e => setCustomer(p => ({ ...p, email: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                        placeholder="billing@acme.com" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Billing Address</label>
                      <input value={customer.address}
                        onChange={e => setCustomer(p => ({ ...p, address: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                        placeholder="Street, City, State - PIN" />
                    </div>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Line Items</label>
                    <button type="button" onClick={addItem}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition">
                      <Plus size={12} /> Add Item
                    </button>
                  </div>

                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500">Item {idx + 1}</span>
                          {items.length > 1 && (
                            <button type="button" onClick={() => removeItem(idx)}
                              className="text-gray-400 hover:text-red-500 transition">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <label className="block text-[10px] text-gray-500 mb-1">Description *</label>
                            <input value={item.description}
                              onChange={e => updateItem(idx, 'description', e.target.value)}
                              placeholder="Product or service description"
                              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-gray-400" />
                          </div>
                          {invoiceType === 'GST' && (
                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">HSN / SAC Code</label>
                              <input value={item.hsnCode}
                                onChange={e => updateItem(idx, 'hsnCode', e.target.value)}
                                placeholder="e.g. 8471"
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-gray-400 font-mono" />
                            </div>
                          )}
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1">Unit</label>
                            <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                              title="Select unit of measurement"
                              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-gray-400">
                              {['Nos', 'Kg', 'Litre', 'Metre', 'Sq.Ft', 'Sq.Mt', 'Box', 'Pcs', 'Set', 'Hr'].map(u =>
                                <option key={u}>{u}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1">Quantity</label>
                            <input type="number" min={0.01} step={0.01} value={item.qty}
                              onChange={e => updateItem(idx, 'qty', parseFloat(e.target.value) || 1)}
                              onFocus={e => e.target.select()}
                              placeholder="Quantity"
                              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-gray-400" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1">Rate (₹)</label>
                            <input type="number" min={0} value={item.price}
                              onChange={e => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                              onFocus={e => e.target.select()}
                              placeholder="Rate per unit"
                              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-gray-400" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1">
                              {invoiceType === 'GST' ? 'GST Rate %' : 'Tax %'}
                            </label>
                            {invoiceType === 'GST' ? (
                              <select value={item.taxPct} onChange={e => updateItem(idx, 'taxPct', parseInt(e.target.value))}
                                title="Select GST rate"
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-gray-400">
                                {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                              </select>
                            ) : (
                              <input type="number" min={0} max={100} step={0.5} value={item.taxPct}
                                onChange={e => updateItem(idx, 'taxPct', parseFloat(e.target.value) || 0)}
                                onFocus={e => e.target.select()}
                                placeholder="0"
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-gray-400" />
                            )}
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1">Amount</label>
                            <div className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-500">
                              {fmt((item.qty || 1) * (item.price || 0))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal</span>
                    <span className="font-medium">{fmt(calc.subtotal)}</span>
                  </div>
                  {invoiceType === 'GST' ? (
                    supplyType === 'INTRASTATE' ? (
                      <>
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>CGST</span>
                          <span>{fmt(gstCalc.cgstTotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>SGST</span>
                          <span>{fmt(gstCalc.sgstTotal)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>IGST</span>
                        <span>{fmt(gstCalc.igstTotal)}</span>
                      </div>
                    )
                  ) : (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Tax</span>
                      <span>{fmt(nonGstCalc.taxTotal)}</span>
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Discount (₹)</label>
                    <input type="number" min={0} value={discount}
                      onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                      onFocus={e => e.target.select()}
                      placeholder="Discount amount"
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-gray-400" />
                  </div>
                  <div className="flex justify-between text-base font-semibold text-gray-900 pt-2 border-t border-gray-200">
                    <span>Total Amount</span>
                    <span>{fmt(calc.grandTotal - discount)}</span>
                  </div>
                </div>

                {/* Notes / Terms */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Notes</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                      placeholder="Payment details, special instructions..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Terms & Conditions</label>
                    <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={3}
                      placeholder="Terms and conditions…"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 resize-none" />
                  </div>
                </div>
              </div>
            </form>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => { setShowForm(false); resetForm() }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:text-gray-900 transition">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Create Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invoice Preview Modal ── */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPreview(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden">

            {/* Modal Header (UI chrome) */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3">
                <Badge tone={STATUS_TONE[preview.status] ?? 'neutral'}>{preview.status}</Badge>
                {preview.invoiceType === 'NON_GST' && (
                  <Badge tone="warning">Non-GST</Badge>
                )}
              </div>
              <button onClick={() => setPreview(null)} className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100">
                <X size={13} className="text-gray-500" />
              </button>
            </div>

            {/* Invoice Document */}
            <div className="p-8 bg-white">

              {/* Invoice Header */}
              <div className="flex items-start justify-between mb-8">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                    {isGST(preview)
                      ? (preview.customer?.gstin ? 'TAX INVOICE' : 'INVOICE')
                      : 'INVOICE'}
                  </p>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {preview.businessName ?? businessName}
                  </h2>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-gray-900">{preview.invoiceNumber}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Issued: {preview.issueDate ? fmtDate(preview.issueDate) : fmtDate(preview.createdAt)}
                  </p>
                  {preview.dueDate && (
                    <p className="text-sm text-gray-500">Due: {fmtDate(preview.dueDate)}</p>
                  )}
                </div>
              </div>

              {/* Bill To */}
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bill To</p>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="font-semibold text-gray-900">{getCustomerName(preview)}</p>
                  {isGST(preview) && preview.customer?.gstin && (
                    <p className="text-sm text-gray-500 font-mono mt-0.5">GSTIN: {preview.customer.gstin}</p>
                  )}
                  {preview.customer?.email && (
                    <p className="text-sm text-gray-500 mt-0.5">{preview.customer.email}</p>
                  )}
                  {preview.customer?.phone && (
                    <p className="text-sm text-gray-500 mt-0.5">{preview.customer.phone}</p>
                  )}
                  {preview.customer?.address && (
                    <p className="text-sm text-gray-500 mt-0.5">{preview.customer.address}</p>
                  )}
                </div>
              </div>

              {/* Supply Type badge — GST only */}
              {isGST(preview) && preview.supplyType && (
                <div className="mb-4">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-3 py-1">
                    {preview.supplyType === 'INTRASTATE' ? 'Intrastate Supply (CGST + SGST)' : 'Interstate Supply (IGST)'}
                  </span>
                </div>
              )}

              {/* Items Table */}
              {preview.items && preview.items.length > 0 ? (
                <div className="mb-6 overflow-x-auto">
                  <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Description</th>
                        {isGST(preview) && (
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">HSN</th>
                        )}
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Qty</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Rate</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Tax%</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.items.map((it, i) => {
                        const lineAmt = it.lineAmount ?? (it.quantity * it.unitPrice)
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-900">{it.description}</td>
                            {isGST(preview) && (
                              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{it.hsnCode || '—'}</td>
                            )}
                            <td className="px-4 py-3 text-right text-gray-700">{it.quantity} {it.unit || ''}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{fmt(it.unitPrice)}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{it.taxRate}%</td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(lineAmt)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Fallback when items array not available */
                <div className="mb-6 h-px bg-gray-100" />
              )}

              {/* Totals */}
              <div className="flex justify-end mb-6">
                <div className="w-64 space-y-1.5">
                  {preview.subtotal != null && (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Subtotal</span>
                      <span>{fmt(preview.subtotal)}</span>
                    </div>
                  )}
                  {/* GST breakdown */}
                  {isGST(preview) ? (
                    <>
                      {(preview.cgstTotal ?? 0) > 0 && (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>CGST</span>
                          <span>{fmt(preview.cgstTotal!)}</span>
                        </div>
                      )}
                      {(preview.sgstTotal ?? 0) > 0 && (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>SGST</span>
                          <span>{fmt(preview.sgstTotal!)}</span>
                        </div>
                      )}
                      {(preview.igstTotal ?? 0) > 0 && (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>IGST</span>
                          <span>{fmt(preview.igstTotal!)}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Non-GST: simple tax line */
                    (preview.taxTotal ?? 0) > 0 && (
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Tax</span>
                        <span>{fmt(preview.taxTotal!)}</span>
                      </div>
                    )
                  )}
                  {(preview.discountAmount ?? 0) > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>Discount</span>
                      <span>- {fmt(preview.discountAmount!)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                    <span>Total</span>
                    <span>{fmt(getAmount(preview))}</span>
                  </div>
                </div>
              </div>

              {/* Notes & Terms */}
              {(preview.notes || preview.terms) && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                  {preview.notes && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                      <p className="text-sm text-gray-600">{preview.notes}</p>
                    </div>
                  )}
                  {preview.terms && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Terms & Conditions</p>
                      <p className="text-sm text-gray-600">{preview.terms}</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
