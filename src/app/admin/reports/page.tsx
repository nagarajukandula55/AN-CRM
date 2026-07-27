'use client'

/**
 * Reports & Downloads hub. Pulls from ALREADY-EXISTING, real API routes
 * (CRM calls/job sheets, sales invoices, audit logs) rather than inventing
 * a separate reporting datastore — each card fetches its own data on demand
 * and exports it as CSV client-side (Blob + object URL), which needs no
 * server-side file generation or storage and therefore has none of the
 * ephemeral-filesystem problems flagged in the CRM invoice PDF work
 * (see admin/crm/invoices/[id]/page.tsx's top comment).
 *
 * Gated by the "reports" ModuleDefinition (REPORTS.VIEW / REPORTS.EXPORT)
 * seeded via /api/admin/seed-crm-modules — same permission chain as every
 * other module, not a special case.
 */

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, Loader2, PhoneCall, ClipboardList, Receipt, ShieldCheck, Send, Archive } from 'lucide-react'

function toCSV(rows: Record<string, any>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n')
}

function downloadCSV(filename: string, rows: Record<string, any>[]) {
  const csv = toCSV(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

interface ReportCardProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  onDownload: () => Promise<void>
}

function ReportCard({ icon: Icon, title, description, onDownload }: ReportCardProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      await onDownload()
    } catch (err: any) {
      setError(err.message || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center">
          <Icon className="w-5 h-5 text-gray-700" />
        </div>
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-2 text-sm font-medium text-gray-900 hover:text-gray-600 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        Download CSV
      </button>
    </div>
  )
}

export default function ReportsPage() {
  const router = useRouter()

  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(today)
  const [pushing, setPushing] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [invoiceMsg, setInvoiceMsg] = useState<string | null>(null)
  const [invoiceErr, setInvoiceErr] = useState<string | null>(null)

  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = meData?.success
    ? (meData.businesses?.find((b: any) => b._id === meData.user?.activeBusinessId) || meData.businesses?.[0])?._id ?? null
    : null

  async function pushToGst() {
    setPushing(true)
    setInvoiceMsg(null)
    setInvoiceErr(null)
    try {
      const period = from.slice(0, 7).split('-').reverse().join('-') // "MM-YYYY"
      const res = await fetch('/api/gst/push-range', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessId, from, to, returnType: 'GSTR1', period }),
      })
      const d = await res.json()
      if (d.success) {
        setInvoiceMsg(`Pushed ${d.summary.submitted}/${d.summary.total} invoices to GST (${d.summary.failed} failed — see GST page for details).`)
      } else {
        setInvoiceErr(d.error || 'Push failed')
      }
    } catch (err: any) {
      setInvoiceErr(err.message || 'Push failed')
    }
    setPushing(false)
  }

  async function downloadZip() {
    setZipping(true)
    setInvoiceMsg(null)
    setInvoiceErr(null)
    try {
      const qs = new URLSearchParams({ from, to, ...(businessId ? { businessId } : {}) })
      const res = await fetch(`/api/reports/invoices-zip?${qs.toString()}`, { credentials: 'include' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to generate ZIP')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoices_${from}_to_${to}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setInvoiceErr(err.message || 'Failed to generate ZIP')
    }
    setZipping(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.push('/admin')} className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Reports & Downloads</h1>
            <p className="text-sm text-gray-400">Export data across CRM, sales, and system activity</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-1">Invoices — Push to GST or Download</h2>
          <p className="text-sm text-gray-500 mb-4">
            Pick a date range. If you use our GST integration, push every invoice in that range straight to your
            configured GSP. Not set up yet (or don't want to use it)? Download every invoice in the range as a
            single ZIP instead.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-gray-500">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <button
              onClick={pushToGst}
              disabled={pushing || !businessId}
              className="flex items-center gap-2 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {pushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Push to GST
            </button>
            <button
              onClick={downloadZip}
              disabled={zipping}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {zipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
              Download All Invoices (ZIP)
            </button>
          </div>
          {invoiceMsg && <p className="mt-3 text-sm text-emerald-600">{invoiceMsg}</p>}
          {invoiceErr && <p className="mt-3 text-sm text-red-600">{invoiceErr}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ReportCard
            icon={PhoneCall}
            title="CRM Calls"
            description="All call records with status, priority, and follow-up dates."
            onDownload={async () => {
              const res = await fetch('/api/crm/calls?limit=1000')
              const d = await res.json()
              if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to load calls')
              const rows = (d.calls || []).map((c: any) => ({
                CallNumber: c.callNumber,
                Customer: c.customerName,
                Company: c.company || '',
                Phone: c.phone,
                Email: c.email || '',
                Subject: c.subject,
                Status: c.status,
                Priority: c.priority,
                AssignedTo: c.assignedTo?.name || '',
                NextFollowUp: c.nextFollowUpAt || '',
                CreatedAt: c.createdAt,
              }))
              downloadCSV(`crm_calls_${Date.now()}.csv`, rows)
            }}
          />

          <ReportCard
            icon={ClipboardList}
            title="CRM Job Sheets"
            description="Job sheets with status, assigned staff, and linked invoice."
            onDownload={async () => {
              const res = await fetch('/api/crm/jobsheets?limit=1000')
              const d = await res.json()
              if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to load job sheets')
              const rows = (d.jobSheets || []).map((j: any) => ({
                JobSheetNumber: j.jobSheetNumber,
                Customer: j.customerName,
                Title: j.title,
                Status: j.status,
                AssignedTo: j.assignedTo?.name || '',
                InvoiceNumber: j.invoiceNumber || '',
                CreatedAt: j.createdAt,
              }))
              downloadCSV(`crm_jobsheets_${Date.now()}.csv`, rows)
            }}
          />

          <ReportCard
            icon={Receipt}
            title="Sales Invoices"
            description="Every invoice with customer, tax breakdown, and payment status."
            onDownload={async () => {
              const res = await fetch('/api/sales/invoices?limit=1000')
              const d = await res.json()
              if (!res.ok || d.success === false) throw new Error(d.error || d.message || 'Failed to load invoices')
              const rows = (d.invoices || []).map((inv: any) => ({
                InvoiceNumber: inv.invoiceNumber,
                Customer: inv.customer?.name || '',
                Status: inv.status,
                Subtotal: inv.subtotal,
                TaxTotal: inv.taxTotal,
                GrandTotal: inv.grandTotal,
                IssueDate: inv.issueDate,
              }))
              downloadCSV(`sales_invoices_${Date.now()}.csv`, rows)
            }}
          />

          <ReportCard
            icon={ShieldCheck}
            title="Audit Log"
            description="Recent create/update/delete activity across the system, for this business."
            onDownload={async () => {
              const res = await fetch('/api/audit/logs?limit=1000')
              const d = await res.json()
              if (!res.ok) throw new Error(d.error || 'Failed to load audit logs — requires AUDIT.VIEW permission')
              const rows = (d.logs || d || []).map((l: any) => ({
                Action: l.action,
                Entity: l.entity,
                EntityId: l.entityId || '',
                By: l.by || l.userEmail || '',
                CreatedAt: l.createdAt,
              }))
              downloadCSV(`audit_log_${Date.now()}.csv`, rows)
            }}
          />
        </div>
      </div>
    </div>
  )
}
