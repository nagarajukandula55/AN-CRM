'use client'

/**
 * Reports & Downloads hub. Pulls from ALREADY-EXISTING, real API routes
 * (CRM calls/job sheets, sales invoices, customers, subscription billing,
 * audit logs) rather than inventing a separate reporting datastore — each
 * card fetches its own data on demand and exports it as CSV client-side
 * (Blob + object URL), which needs no server-side file generation or
 * storage and therefore has none of the ephemeral-filesystem problems
 * flagged in the CRM invoice PDF work (see admin/crm/invoices/[id]/page.tsx's
 * top comment).
 *
 * Every card shares one date range and gets its own status filter where the
 * underlying data has a meaningful status -- per explicit direction ("these
 * are not even basic... give good number of reports and good filters and
 * multiple scenarios"), rather than the previous fixed no-filter CSV dumps.
 * Sales Invoices' date range is applied server-side (the route already
 * supports from/to); Calls/Job Sheets/Audit Log don't expose date filtering
 * server-side, so the range is applied client-side against the fetched rows.
 *
 * Gated by the "reports" ModuleDefinition (REPORTS.VIEW / REPORTS.EXPORT)
 * seeded via /api/admin/seed-crm-modules — same permission chain as every
 * other module, not a special case.
 */

import { useState } from 'react'
import useSWR from 'swr'
import { PhoneCall, ClipboardList, Receipt, ShieldCheck, Send, Archive, Users, CreditCard, Download } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'

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

// Client-side range filter for endpoints without a from/to query param --
// applied against whatever date field the caller passes in.
function inRange(dateStr: string | undefined, from: string, to: string): boolean {
  if (!dateStr) return false
  const d = dateStr.slice(0, 10)
  return d >= from && d <= to
}

interface ReportCardProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  statusOptions?: string[]
  status: string
  onStatusChange?: (v: string) => void
  onDownload: () => Promise<void>
}

function ReportCard({ icon: Icon, title, description, statusOptions, status, onStatusChange, onDownload }: ReportCardProps) {
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
    <Card>
      <CardBody>
        <div className="w-11 h-11 rounded-control bg-surface-2 flex items-center justify-center mb-4">
          <Icon className="w-5 h-5 text-ink-2" />
        </div>
        <h3 className="font-semibold text-ink mb-1">{title}</h3>
        <p className="text-sm text-ink-3 mb-4">{description}</p>
        {statusOptions && onStatusChange && (
          <Select value={status} onChange={(e) => onStatusChange(e.target.value)} className="mb-3">
            <option value="">All statuses</option>
            {statusOptions.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </Select>
        )}
        {error && <p className="text-xs text-danger mb-2">{error}</p>}
        <Button variant="secondary" size="sm" onClick={handleClick} disabled={loading} icon={<Download className="w-4 h-4" />}>
          {loading ? 'Preparing…' : 'Download CSV'}
        </Button>
      </CardBody>
    </Card>
  )
}

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(today)
  const [pushing, setPushing] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [invoiceMsg, setInvoiceMsg] = useState<string | null>(null)
  const [invoiceErr, setInvoiceErr] = useState<string | null>(null)

  const [callStatus, setCallStatus] = useState('')
  const [jobStatus, setJobStatus] = useState('')
  const [invoiceStatus, setInvoiceStatus] = useState('')

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
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader title="Reports & Downloads" description="Export data across CRM, sales, billing, and system activity — filtered by date range and status." />

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-3 flex-1 min-w-[200px]">Applies to every report below and the GST/ZIP export.</p>
        </CardBody>
      </Card>

      <Card className="mb-8">
        <CardBody>
          <h2 className="font-semibold text-ink mb-1">Invoices — Push to GST or Download</h2>
          <p className="text-sm text-ink-3 mb-4">
            If you use our GST integration, push every invoice in the selected range straight to your configured
            GSP. Not set up yet (or don't want to use it)? Download every invoice in the range as a single ZIP
            instead.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={pushToGst} disabled={pushing || !businessId} icon={<Send className="w-4 h-4" />}>
              {pushing ? 'Pushing…' : 'Push to GST'}
            </Button>
            <Button variant="secondary" onClick={downloadZip} disabled={zipping} icon={<Archive className="w-4 h-4" />}>
              {zipping ? 'Zipping…' : 'Download All Invoices (ZIP)'}
            </Button>
          </div>
          {invoiceMsg && <p className="mt-3 text-sm text-success">{invoiceMsg}</p>}
          {invoiceErr && <p className="mt-3 text-sm text-danger">{invoiceErr}</p>}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ReportCard
          icon={PhoneCall}
          title="CRM Calls"
          description="Call records with status, priority, and follow-up dates — filtered to the date range and status above."
          statusOptions={['NEW', 'IN_PROGRESS', 'FOLLOW_UP', 'JOB_CREATED', 'CLOSED', 'CANCELLED']}
          status={callStatus}
          onStatusChange={setCallStatus}
          onDownload={async () => {
            const qs = new URLSearchParams({ limit: '1000', ...(callStatus ? { status: callStatus } : {}) })
            const res = await fetch(`/api/crm/calls?${qs.toString()}`)
            const d = await res.json()
            if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to load calls')
            const rows = (d.calls || [])
              .filter((c: any) => inRange(c.createdAt, from, to))
              .map((c: any) => ({
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
            downloadCSV(`crm_calls_${from}_to_${to}.csv`, rows)
          }}
        />

        <ReportCard
          icon={ClipboardList}
          title="CRM Job Sheets"
          description="Workorders with status, assigned engineer, and linked invoice — filtered to the date range and status above."
          statusOptions={['CREATED', 'REPAIR_STARTED', 'REPAIR_IN_PROGRESS', 'PART_PENDING', 'REPAIR_COMPLETED', 'CLOSED', 'CANCELLED']}
          status={jobStatus}
          onStatusChange={setJobStatus}
          onDownload={async () => {
            const qs = new URLSearchParams({ limit: '1000', ...(jobStatus ? { status: jobStatus } : {}) })
            const res = await fetch(`/api/crm/jobsheets?${qs.toString()}`)
            const d = await res.json()
            if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to load job sheets')
            const rows = (d.jobSheets || [])
              .filter((j: any) => inRange(j.createdAt, from, to))
              .map((j: any) => ({
                JobSheetNumber: j.jobSheetNumber,
                Customer: j.customerName,
                Phone: j.phone || '',
                Title: j.title,
                Status: j.status,
                AssignedTo: j.assignedTo?.name || j.assignedToName || '',
                InvoiceNumber: j.invoiceNumber || '',
                IMEIOrSerial: j.imeiOrSerialNumber || '',
                CreatedAt: j.createdAt,
                CompletedAt: j.completedAt || '',
              }))
            downloadCSV(`crm_jobsheets_${from}_to_${to}.csv`, rows)
          }}
        />

        <ReportCard
          icon={Receipt}
          title="Sales Invoices"
          description="Every invoice with customer, tax breakdown, and payment status — date range applied server-side."
          statusOptions={['DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED']}
          status={invoiceStatus}
          onStatusChange={setInvoiceStatus}
          onDownload={async () => {
            const qs = new URLSearchParams({ limit: '1000', from, to, ...(invoiceStatus ? { status: invoiceStatus } : {}) })
            const res = await fetch(`/api/sales/invoices?${qs.toString()}`)
            const d = await res.json()
            if (!res.ok || d.success === false) throw new Error(d.error || d.message || 'Failed to load invoices')
            const rows = (d.invoices || []).map((inv: any) => ({
              InvoiceNumber: inv.invoiceNumber,
              Customer: inv.customer?.name || '',
              Phone: inv.customer?.phone || '',
              Type: inv.invoiceType,
              Status: inv.status,
              Subtotal: inv.subtotal,
              TaxTotal: inv.taxTotal,
              GrandTotal: inv.grandTotal,
              CreatedAt: inv.createdAt,
            }))
            downloadCSV(`sales_invoices_${from}_to_${to}.csv`, rows)
          }}
        />

        <ReportCard
          icon={Users}
          title="Customer Directory"
          description="Every captured customer — contact details, source, and logged IMEI/Serial numbers."
          status=""
          onDownload={async () => {
            const res = await fetch(`/api/customers${businessId ? `?businessId=${businessId}` : ''}`)
            const d = await res.json()
            if (!res.ok || d.success === false) throw new Error(d.error || 'Failed to load customers')
            const rows = (d.customers || [])
              .filter((c: any) => inRange(c.createdAt, from, to))
              .map((c: any) => ({
                Name: c.name,
                Phone: c.phone || '',
                Email: c.email || '',
                City: c.city || '',
                State: c.state || '',
                IMEIOrSerial: Array.isArray(c.imeiOrSerialNumbers) ? c.imeiOrSerialNumbers.join('; ') : '',
                Source: c.source || '',
                CreatedAt: c.createdAt,
              }))
            downloadCSV(`customers_${from}_to_${to}.csv`, rows)
          }}
        />

        <ReportCard
          icon={CreditCard}
          title="Subscription Billing"
          description="This business's own AN-CRM plan-payment history — plan, period, and amount charged."
          status=""
          onDownload={async () => {
            const res = await fetch('/api/subscriptions/invoices')
            const d = await res.json()
            if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to load billing history')
            const rows = (d.invoices || [])
              .filter((inv: any) => inRange(inv.createdAt, from, to))
              .map((inv: any) => ({
                InvoiceNumber: inv.invoiceNumber,
                Plan: inv.plan,
                BillingPeriod: inv.billingPeriod,
                Amount: inv.amount,
                TaxTotal: inv.taxTotal,
                GrandTotal: inv.grandTotal,
                PeriodStart: inv.periodStart,
                PeriodEnd: inv.periodEnd,
                CreatedAt: inv.createdAt,
              }))
            downloadCSV(`subscription_billing_${from}_to_${to}.csv`, rows)
          }}
        />

        <ReportCard
          icon={ShieldCheck}
          title="Audit Log"
          description="Create/update/delete activity across the system for this business, in the selected date range."
          status=""
          onDownload={async () => {
            const res = await fetch('/api/audit/logs?limit=1000')
            const d = await res.json()
            if (!res.ok) throw new Error(d.error || 'Failed to load audit logs — requires AUDIT.VIEW permission')
            const rows = (d.logs || d || [])
              .filter((l: any) => inRange(l.createdAt, from, to))
              .map((l: any) => ({
                Action: l.action,
                Entity: l.entity,
                EntityId: l.entityId || '',
                By: l.by || l.userEmail || '',
                CreatedAt: l.createdAt,
              }))
            downloadCSV(`audit_log_${from}_to_${to}.csv`, rows)
          }}
        />
      </div>
    </div>
  )
}
