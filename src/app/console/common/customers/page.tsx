'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, X, Search, Download, Upload, Users } from 'lucide-react'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { useColumnConfig } from '@/lib/hooks/useColumnConfig'
import { Spinner } from '@/components/ui/Spinner'

interface Customer {
  _id: string
  name: string
  phone?: string
  email?: string
  gstin?: string
  city?: string
  state?: string
  source?: string
  imeiOrSerialNumbers?: string[]
  createdAt: string
}

// Default column set for this page's pageKey ("customers") -- super admin
// can toggle visibility/order/labels via Admin > Page Columns.
const CUSTOMERS_DEFAULT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'contact', label: 'Contact' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'location', label: 'Location' },
  { key: 'imeiOrSerial', label: 'IMEI/Serial' },
  { key: 'source', label: 'Source' },
  { key: 'date', label: 'Date' },
]

function downloadTemplate() {
  const rows = [
    'name,phone,email,address,city,state,pincode',
    'John Doe,9876543210,john@example.com,123 Main St,Bengaluru,Karnataka,560001',
  ]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'customer-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function CustomersPage() {
  const router = useRouter()
  const { businessId } = useActiveBusinessId()
  const columns = useColumnConfig('customers', CUSTOMERS_DEFAULT_COLUMNS).filter((c) => c.visible)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const [form, setForm] = useState({ name: '', phone: '', email: '', gstin: '', address: '', city: '', state: '', pincode: '', notes: '' })

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const customersParams = (() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    return params.toString()
  })()
  const { data: customersData, isLoading: loading, mutate: fetchCustomers } = useSWR(
    `/api/customers?${customersParams}`,
    { keepPreviousData: true }
  )
  const customers: Customer[] = customersData?.success ? (customersData.customers || []) : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, businessId }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to add customer')
      setShowForm(false)
      setForm({ name: '', phone: '', email: '', gstin: '', address: '', city: '', state: '', pincode: '', notes: '' })
      showToast('Customer added')
      fetchCustomers()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // matches api/customers/upload's server-side MAX_BYTES

  async function handleUpload(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the limit is 10MB. Split it into smaller files and upload each separately.`)
      return
    }
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (businessId) fd.append('businessId', businessId)
      const res = await fetch('/api/customers/upload', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Upload failed')
      showToast(`Imported ${d.imported} of ${d.totalRows} rows`)
      fetchCustomers()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-2 text-ink">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        {toast && (
          <div className="fixed top-6 right-6 z-50 rounded-card border border-border bg-surface px-5 py-3 text-sm text-ink shadow-2xl">
            {toast}
          </div>
        )}

        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.push('/console')} className="w-9 h-9 rounded-card border border-border bg-surface flex items-center justify-center hover:bg-surface-2 transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Customer Data</h1>
            <p className="text-sm text-ink-3">Manually entered now — aggregated from every business over time</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto flex items-center gap-2 bg-accent text-accent-fg text-sm font-medium px-4 py-2 rounded-card hover:bg-accent-hover transition"
          >
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>

        {error && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-card px-4 py-3">{error}</div>}

        <div className="rounded-card border border-border bg-surface p-5 mb-6 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, email, or IMEI/Serial…"
              className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-control text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-border-strong"
            />
          </div>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-ink-3 border border-border rounded-control hover:text-ink hover:border-border-strong transition"
          >
            <Download size={12} /> Download Template
          </button>
          <label
            title="CSV only, up to 10MB"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-2 border border-border rounded-control cursor-pointer hover:bg-surface-2 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploading ? <Spinner size={12} /> : <Upload size={12} />}
            {uploading ? 'Uploading…' : 'Upload CSV (max 10MB)'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>

        <div className="rounded-card border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {columns.map((col) => (
                  <th key={col.key} className="text-left px-6 py-3 text-ink-3 font-medium">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={columns.length} className="px-6 py-10 text-center text-ink-3">Loading…</td></tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-10 text-center text-ink-3">
                    <Users className="w-6 h-6 mx-auto mb-2 text-ink-3" />
                    No customers found
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const cellFor = (key: string) => {
                    switch (key) {
                      case 'name':
                        return <td key={key} className="px-6 py-3 font-medium text-ink">{c.name}</td>
                      case 'contact':
                        return (
                          <td key={key} className="px-6 py-3 text-ink-3">
                            <p>{c.phone}</p>
                            {c.email && <p className="text-xs text-ink-3">{c.email}</p>}
                          </td>
                        )
                      case 'gstin':
                        return <td key={key} className="px-6 py-3 text-ink-3 text-xs">{c.gstin || '—'}</td>
                      case 'location':
                        return <td key={key} className="px-6 py-3 text-ink-3">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                      case 'imeiOrSerial':
                        return (
                          <td key={key} className="px-6 py-3 text-ink-3 text-xs">
                            {Array.isArray(c.imeiOrSerialNumbers) && c.imeiOrSerialNumbers.length > 0
                              ? c.imeiOrSerialNumbers.join(', ')
                              : '—'}
                          </td>
                        )
                      case 'source':
                        return <td key={key} className="px-6 py-3 text-ink-3 text-xs">{c.source || '—'}</td>
                      case 'date':
                        return <td key={key} className="px-6 py-3 text-ink-3">{new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      default:
                        return <td key={key} className="px-6 py-3">—</td>
                    }
                  }
                  return (
                    <tr key={c._id} className="hover:bg-surface-2 transition">
                      {columns.map((col) => cellFor(col.key))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="flex-1 bg-surface-2/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-md max-h-[90vh] bg-surface-2 border border-border rounded-card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="font-semibold text-ink">Add Customer</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-control bg-surface border border-border flex items-center justify-center hover:bg-surface-2">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
              <div>
                <label className="block text-xs text-ink-3 mb-1.5">Name *</label>
                <input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink outline-none focus:border-border-strong" />
              </div>
              <div>
                <label className="block text-xs text-ink-3 mb-1.5">Phone</label>
                <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink outline-none focus:border-border-strong" />
              </div>
              <div>
                <label className="block text-xs text-ink-3 mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink outline-none focus:border-border-strong" />
              </div>
              <div>
                <label className="block text-xs text-ink-3 mb-1.5">GSTIN</label>
                <input value={form.gstin} onChange={(e) => setForm((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                  className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink outline-none focus:border-border-strong" />
              </div>
              <div>
                <label className="block text-xs text-ink-3 mb-1.5">Address</label>
                <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink outline-none focus:border-border-strong" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="City" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  className="bg-surface border border-border rounded-card px-3 py-2.5 text-sm text-ink outline-none focus:border-border-strong" />
                <input placeholder="State" value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                  className="bg-surface border border-border rounded-card px-3 py-2.5 text-sm text-ink outline-none focus:border-border-strong" />
                <input placeholder="Pincode" value={form.pincode} onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))}
                  className="bg-surface border border-border rounded-card px-3 py-2.5 text-sm text-ink outline-none focus:border-border-strong" />
              </div>
              <div>
                <label className="block text-xs text-ink-3 mb-1.5">Notes</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink outline-none focus:border-border-strong resize-none" />
              </div>
              {error && <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-card px-4 py-3">{error}</div>}
            </form>
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 rounded-card border border-border bg-surface text-sm text-ink-3 hover:text-ink transition">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={submitting} className="flex-1 px-4 py-2.5 rounded-card bg-accent text-accent-fg text-sm font-medium hover:bg-accent-hover transition disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting && <Spinner size={16} />}
                Add Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
