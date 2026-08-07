'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2,
  Plus,
  X,
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PhoneCall,
  ClipboardList,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  IndianRupee,
  Wallet,
  Clock,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

interface Appointment {
  _id: string
  customerName: string
  subject?: string
  status: string
  createdAt: string
}

interface Workorder {
  _id: string
  jobSheetNumber: string
  customerName: string
  title: string
  status: string
  createdAt: string
}

const OPEN_APPOINTMENT_STATUSES = new Set(['NEW', 'CONTACTED', 'QUALIFIED', 'IN_PROGRESS'])
const OPEN_WORKORDER_STATUSES = new Set(['CREATED', 'REPAIR_STARTED', 'REPAIR_IN_PROGRESS', 'REPAIR_COMPLETED'])

function ageingDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

interface Lead {
  _id: string
  name: string
  email?: string
  phone?: string
  status: string
  source?: string
  notes?: string
  createdAt: string
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  NEW: 'info',
  CONTACTED: 'warning',
  QUALIFIED: 'info',
  WON: 'success',
  LOST: 'danger',
}

const STATUSES = ['ALL', 'NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST']

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export default function CRMPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    source: '',
    notes: '',
  })

  const [gateChecked, setGateChecked] = useState(false)
  const [crmEnabled, setCrmEnabled] = useState(true)

  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = meData ? ((meData.user ?? meData).activeBusinessId ?? meData.businesses?.[0]?._id ?? null) : null
  // SC has no appointment/lead pipeline of its own -- it's a single-login
  // repair shop where everything IS a workorder from intake onward, per
  // explicit direction ("For SC type there is not appointment system so
  // don't keep anything for this type ... only workorders everywhere").
  // Every other operating mode (Brand/POS) keeps the full Appointments +
  // Leads pipeline unchanged.
  const activeBusiness = meData?.businesses?.find((b: any) => b._id === businessId) || meData?.businesses?.[0]
  const isSC = activeBusiness?.operatingMode === 'SC'

  // Was missing businessId entirely -- fetched every lead across every
  // business in the system regardless of which one was active, which is
  // why this page's Leads section looked like it "wasn't fetching
  // properly" (wrong/empty/mismatched data depending on what leads
  // happened to exist elsewhere).
  const { data: leadsData, isLoading: loadingLeads, mutate: fetchLeads } = useSWR(
    !isSC && businessId ? `/api/crm/leads?businessId=${businessId}` : null
  )
  const leads: Lead[] = leadsData ? (Array.isArray(leadsData) ? leadsData : (leadsData.leads ?? [])) : []
  // For SC, nothing gates on the (disabled) leads fetch -- the page's
  // loading state instead waits on whichever business/workorder data is
  // actually being shown.
  const loading = isSC ? !gateChecked : loadingLeads

  useEffect(() => {
    if (!businessId) return
    // Reuses the exact permission + Business.modules[] gating the sidebar
    // itself uses, so a business without CRM assigned sees the same "not
    // enabled" state here as it would from a direct URL visit.
    fetch('/api/ui/sidebar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId }),
    })
      .then(r => r.json())
      .then(d => {
        const modules = d.modules || []
        setCrmEnabled(modules.some((m: any) => String(m.key).startsWith('crm') || String(m.key) === 'sc_jobsheets'))
      })
      .catch(() => setCrmEnabled(true))
      .finally(() => setGateChecked(true))
  }, [businessId])

  const { data: appointmentsData } = useSWR(!isSC && businessId ? `/api/crm/calls?businessId=${businessId}&limit=100` : null)
  const appointments: Appointment[] = appointmentsData?.calls || []

  const { data: workordersData } = useSWR(businessId ? `/api/crm/jobsheets?businessId=${businessId}&limit=100` : null)
  const workorders: Workorder[] = workordersData?.jobSheets || []

  const { data: revenueData } = useSWR(businessId ? `/api/crm/revenue?businessId=${businessId}` : null)
  const revenue = revenueData?.success
    ? { totalRevenue: revenueData.totalRevenue, revenueThisMonth: revenueData.revenueThisMonth, outstanding: revenueData.outstanding }
    : { totalRevenue: 0, revenueThisMonth: 0, outstanding: 0 }

  const fmtCurrency = (n: number) =>
    n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

  const workorderStatusBreakdown = workorders.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] || 0) + 1
    return acc
  }, {})
  const appointmentStatusBreakdown = appointments.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1
    return acc
  }, {})

  const openAppointments = appointments.filter(a => OPEN_APPOINTMENT_STATUSES.has(a.status)).length
  // "Pending" = not yet contacted at all -- the freshest, most actionable
  // subset of "open" (which also includes calls already in progress).
  const pendingCalls = appointments.filter(a => a.status === 'NEW').length
  const openWorkorders = workorders.filter(w => OPEN_WORKORDER_STATUSES.has(w.status)).length
  const overdueWorkorders = workorders.filter(w => OPEN_WORKORDER_STATUSES.has(w.status) && ageingDays(w.createdAt) >= 7).length
  const now = new Date()
  const closedThisMonth = workorders.filter(w => {
    if (w.status !== 'CLOSED') return false
    const d = new Date(w.createdAt)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const recentActivity = [
    ...(isSC ? [] : appointments.map(a => ({ id: a._id, kind: 'Appointment' as const, title: a.customerName, sub: a.subject || a.status, date: a.createdAt, href: `/console/crm/calls/${a._id}` }))),
    ...workorders.map(w => ({ id: w._id, kind: 'Workorder' as const, title: w.jobSheetNumber, sub: w.title, date: w.createdAt, href: `/console/sc/jobsheets/${w._id}` })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.message ?? 'Failed to create lead')
      }
      setShowForm(false)
      setForm({ name: '', email: '', phone: '', source: '', notes: '' })
      fetchLeads()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const total = leads.length
  const won = leads.filter((l) => l.status === 'WON').length
  const lost = leads.filter((l) => l.status === 'LOST').length
  const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0

  const filtered = leads.filter((l) => statusFilter === 'ALL' || l.status === statusFilter)

  if (loading) {
    return <LoadingPanel label="Loading CRM overview…" />
  }

  if (gateChecked && !crmEnabled) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-3 text-center px-6">
        <AlertCircle className="w-10 h-10 text-ink-3" />
        <h2 className="h-section">CRM isn't enabled for this business</h2>
        <p className="text-sm text-ink-2 max-w-sm">Ask a Super Admin to enable the CRM module for this business from Businesses &gt; Modules.</p>
        <Button variant="secondary" className="mt-2" onClick={() => router.push('/console')}>Go to Dashboard</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="CRM Overview"
        description={isSC ? 'Workorders, revenue and analytics in one place' : 'Appointments, workorders, revenue and analytics in one place'}
        actions={!isSC ? <Button onClick={() => setShowForm(true)} icon={<Plus className="w-4 h-4" />}>New Lead</Button> : undefined}
      />

      {/* Real dashboard KPIs, sourced from Appointments + Workorders (not
          the legacy leads list below), only shown once the module-gate
          check confirms CRM is actually enabled for this business. SC has
          no appointment pipeline, so its KPI row is workorder-only. */}
      <div className={`grid grid-cols-2 ${isSC ? 'lg:grid-cols-4' : 'lg:grid-cols-5'} gap-4 mb-6`}>
        {(isSC
          ? [
              { icon: ClipboardList, label: 'Open Workorders', value: String(openWorkorders) },
              { icon: AlertCircle, label: 'Overdue (7d+)', value: String(overdueWorkorders) },
              { icon: CheckCircle2, label: 'Closed This Month', value: String(closedThisMonth) },
            ]
          : [
              { icon: PhoneCall, label: 'Open Appointments', value: String(openAppointments) },
              { icon: Clock, label: 'Pending Calls', value: String(pendingCalls) },
              { icon: ClipboardList, label: 'Open Workorders', value: String(openWorkorders) },
              { icon: AlertCircle, label: 'Overdue (7d+)', value: String(overdueWorkorders) },
              { icon: CheckCircle2, label: 'Closed This Month', value: String(closedThisMonth) },
            ]
        ).map(({ icon: Icon, label, value }) => (
          <Card key={label} className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-ink-3 text-sm">{label}</span>
              <div className="w-8 h-8 rounded-control bg-surface-2 flex items-center justify-center">
                <Icon className="w-4 h-4 text-ink-2" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-ink tabular">{value}</p>
          </Card>
        ))}
      </div>

      {/* Revenue, sourced from SalesInvoices generated by CRM job-sheet
          closures (see /api/crm/revenue) -- the billing figures live
          alongside the operational ones so this page doubles as the
          official CRM-module dashboard. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { icon: IndianRupee, label: 'Revenue This Month', value: fmtCurrency(revenue.revenueThisMonth) },
          { icon: TrendingUp, label: 'Total Revenue', value: fmtCurrency(revenue.totalRevenue) },
          { icon: Wallet, label: 'Outstanding', value: fmtCurrency(revenue.outstanding) },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-ink-3 text-sm">{label}</span>
              <div className="w-8 h-8 rounded-control bg-surface-2 flex items-center justify-center">
                <Icon className="w-4 h-4 text-ink-2" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-ink tabular">{value}</p>
          </Card>
        ))}
      </div>

      {/* Lightweight analytics -- status breakdown bars for appointments
          and workorders, computed client-side from the same data already
          fetched above, no chart library needed. */}
      <div className={`grid grid-cols-1 ${isSC ? '' : 'sm:grid-cols-2'} gap-4 mb-6`}>
        {(isSC
          ? [{ title: 'Workorders by Status', data: workorderStatusBreakdown, total: workorders.length }]
          : [
              { title: 'Appointments by Status', data: appointmentStatusBreakdown, total: appointments.length },
              { title: 'Workorders by Status', data: workorderStatusBreakdown, total: workorders.length },
            ]
        ).map(({ title, data, total }) => (
          <Card key={title} className="p-6">
            <p className="eyebrow mb-4">{title}</p>
            {Object.keys(data).length === 0 ? (
              <p className="text-sm text-ink-3">No data yet</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(data).map(([status, count]) => (
                  <div key={status}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-ink-2">{status}</span>
                      <span className="text-ink-3 tabular">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${total ? Math.round((count / total) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {recentActivity.length > 0 && (
        <Card className="overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-border">
            <p className="eyebrow">Recent Activity</p>
          </div>
          <div className="divide-y divide-border">
            {recentActivity.map(item => (
              <button
                key={`${item.kind}-${item.id}`}
                onClick={() => router.push(item.href)}
                className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-surface-2 transition"
              >
                <div className="flex items-center gap-3">
                  <Badge tone={item.kind === 'Appointment' ? 'info' : 'success'}>{item.kind}</Badge>
                  <span className="text-sm font-medium text-ink">{item.title}</span>
                  <span className="text-sm text-ink-3">{item.sub}</span>
                </div>
                <span className="text-xs text-ink-3">{fmtDate(item.date)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Full call-entry -> job sheet -> invoice -> closure lifecycle
          lives under these two sections — the lead list above is kept for
          backward compatibility (existing /api/crm/leads data) but new
          work should flow through Appointments -> Workorders. SC skips
          straight to Workorders -- it has no appointment pipeline. */}
      <div className="grid grid-cols-1 gap-4 mb-8">
        <Link href="/console/sc/jobsheets">
          <Card className="p-6 hover:shadow-card-lg hover:border-border-strong transition group flex items-center gap-4">
            <div className="w-11 h-11 rounded-control bg-success-soft text-success flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-ink">Workorders</h3>
              <p className="text-sm text-ink-3">Scheduled work through invoicing</p>
            </div>
            <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-ink-2 transition" />
          </Card>
        </Link>
      </div>

      {error && (
        <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">
          {error}
        </div>
      )}

      {/* Stats -- legacy Leads pipeline, not applicable to SC (no lead
          concept at all there). */}
      {!isSC && <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: Users, label: 'Total Leads', value: String(total), filterValue: null },
          { icon: TrendingUp, label: 'Won', value: String(won), filterValue: 'WON' },
          { icon: TrendingDown, label: 'Lost', value: String(lost), filterValue: 'LOST' },
          { icon: BarChart3, label: 'Conversion Rate', value: `${conversionRate}%`, filterValue: null },
        ].map(({ icon: Icon, label, value, filterValue }) => {
          const isActive = filterValue !== null && statusFilter === filterValue;
          return (
            <button
              key={label}
              type="button"
              disabled={filterValue === null}
              onClick={() =>
                filterValue &&
                setStatusFilter(statusFilter === filterValue ? 'ALL' : filterValue)
              }
              className={`text-left rounded-card border bg-surface p-6 transition-colors ${
                filterValue === null ? 'cursor-default' : ''
              } ${
                isActive ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-border-strong'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-ink-3 text-sm">{label}</span>
                <div className="w-8 h-8 rounded-control bg-surface-2 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-ink-2" />
                </div>
              </div>
              <p className="text-2xl font-semibold text-ink tabular">{value}</p>
            </button>
          );
        })}
      </div>}

      {/* Status Filter */}
      {!isSC && <div className="flex gap-1 flex-wrap mb-6">
        {STATUSES.map((s) => (
          <Button key={s} variant={statusFilter === s ? 'primary' : 'secondary'} size="sm" onClick={() => setStatusFilter(s)}>
            {s}
          </Button>
        ))}
      </div>}

      {/* Leads Table */}
      {!isSC && <Card className="overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-6 py-3 text-ink-3 font-medium">Name</th>
              <th className="text-left px-6 py-3 text-ink-3 font-medium">Contact</th>
              <th className="text-left px-6 py-3 text-ink-3 font-medium">Source</th>
              <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
              <th className="text-left px-6 py-3 text-ink-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr><td colSpan={5}><EmptyState kind="empty" title="No leads found" /></td></tr>
            ) : (
              filtered.map((lead) => (
                <tr key={lead._id} className="hover:bg-surface-2 transition">
                  <td className="px-6 py-3 font-medium text-ink">{lead.name}</td>
                  <td className="px-6 py-3 text-ink-2">
                    <p>{lead.email}</p>
                    {lead.phone && <p className="text-ink-3 text-xs">{lead.phone}</p>}
                  </td>
                  <td className="px-6 py-3 text-ink-2">{lead.source ?? '—'}</td>
                  <td className="px-6 py-3 text-center">
                    <Badge tone={STATUS_TONE[lead.status] ?? 'neutral'}>{lead.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-ink-3">{fmtDate(lead.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>}

      {/* Slide-over: New Lead */}
      {!isSC && showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="relative w-full max-w-3xl max-h-[90vh] bg-surface border border-border rounded-card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="h-section">New Lead</h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-control bg-surface-2 border border-border flex items-center justify-center hover:bg-surface-3"
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
              {([
                { field: 'name', label: 'Full Name *', required: true, type: 'text' },
                { field: 'email', label: 'Email', required: false, type: 'email' },
                { field: 'phone', label: 'Phone', required: false, type: 'tel' },
                { field: 'source', label: 'Source', required: false, type: 'text' },
              ] as const).map(({ field, label, required, type }) => (
                <Field key={field} label={label}>
                  <Input
                    type={type}
                    required={required}
                    value={form[field]}
                    onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))}
                  />
                </Field>
              ))}
              <Field label="Notes">
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={3}
                />
              </Field>
            </form>
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={submitting}
                icon={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
              >
                Create Lead
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
