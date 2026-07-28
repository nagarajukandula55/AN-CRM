'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
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
} from 'lucide-react'

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

const statusColors: Record<string, string> = {
  NEW: 'bg-blue-500/20 text-blue-400',
  CONTACTED: 'bg-yellow-500/20 text-yellow-400',
  QUALIFIED: 'bg-purple-500/20 text-purple-400',
  WON: 'bg-green-500/20 text-green-400',
  LOST: 'bg-red-500/20 text-red-400',
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

  const { data: leadsData, isLoading: loading, mutate: fetchLeads } = useSWR('/api/crm/leads')
  const leads: Lead[] = leadsData ? (Array.isArray(leadsData) ? leadsData : (leadsData.leads ?? [])) : []

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
        setCrmEnabled(modules.some((m: any) => String(m.key).startsWith('crm')))
      })
      .catch(() => setCrmEnabled(true))
      .finally(() => setGateChecked(true))
  }, [businessId])

  const { data: appointmentsData } = useSWR(businessId ? `/api/crm/calls?businessId=${businessId}&limit=100` : null)
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
  const openWorkorders = workorders.filter(w => OPEN_WORKORDER_STATUSES.has(w.status)).length
  const overdueWorkorders = workorders.filter(w => OPEN_WORKORDER_STATUSES.has(w.status) && ageingDays(w.createdAt) >= 7).length
  const now = new Date()
  const closedThisMonth = workorders.filter(w => {
    if (w.status !== 'CLOSED') return false
    const d = new Date(w.createdAt)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const recentActivity = [
    ...appointments.map(a => ({ id: a._id, kind: 'Appointment' as const, title: a.customerName, sub: a.subject || a.status, date: a.createdAt, href: `/console/crm/calls/${a._id}` })),
    ...workorders.map(w => ({ id: w._id, kind: 'Workorder' as const, title: w.jobSheetNumber, sub: w.title, date: w.createdAt, href: `/console/crm/jobsheets/${w._id}` })),
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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    )
  }

  if (gateChecked && !crmEnabled) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 text-center px-6">
        <AlertCircle className="w-10 h-10 text-gray-300" />
        <h2 className="text-lg font-medium text-gray-900">CRM isn't enabled for this business</h2>
        <p className="text-sm text-gray-500 max-w-sm">Ask a Super Admin to enable the CRM module for this business from Businesses &gt; Modules.</p>
        <button onClick={() => router.push('/console')} className="mt-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition">
          Go to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/console')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">CRM Overview</h1>
            <p className="text-sm text-gray-400">Appointments, workorders, revenue and analytics in one place</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-800 transition"
          >
            <Plus className="w-4 h-4" /> New Lead
          </button>
        </div>

        {/* Real dashboard KPIs, sourced from Appointments + Workorders (not
            the legacy leads list below), only shown once the module-gate
            check confirms CRM is actually enabled for this business. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { icon: PhoneCall, label: 'Open Appointments', value: String(openAppointments) },
            { icon: ClipboardList, label: 'Open Workorders', value: String(openWorkorders) },
            { icon: AlertCircle, label: 'Overdue (7d+)', value: String(overdueWorkorders) },
            { icon: CheckCircle2, label: 'Closed This Month', value: String(closedThisMonth) },
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

        {/* Lightweight analytics -- status breakdown bars for appointments
            and workorders, computed client-side from the same data already
            fetched above, no chart library needed. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {[
            { title: 'Appointments by Status', data: appointmentStatusBreakdown, total: appointments.length },
            { title: 'Workorders by Status', data: workorderStatusBreakdown, total: workorders.length },
          ].map(({ title, data, total }) => (
            <div key={title} className="rounded-2xl border border-gray-200 bg-white p-6">
              <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 mb-4">{title}</p>
              {Object.keys(data).length === 0 ? (
                <p className="text-sm text-gray-400">No data yet</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(data).map(([status, count]) => (
                    <div key={status}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600">{status}</span>
                        <span className="text-gray-400">{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full bg-gray-900 rounded-full"
                          style={{ width: `${total ? Math.round((count / total) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {recentActivity.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Recent Activity</p>
            </div>
            <div className="divide-y divide-gray-100">
              {recentActivity.map(item => (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => router.push(item.href)}
                  className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${item.kind === 'Appointment' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {item.kind}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{item.title}</span>
                    <span className="text-sm text-gray-400">{item.sub}</span>
                  </div>
                  <span className="text-xs text-gray-400">{fmtDate(item.date)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Full call-entry -> job sheet -> invoice -> closure lifecycle
            lives under these two sections — the lead list above is kept for
            backward compatibility (existing /api/crm/leads data) but new
            work should flow through Appointments -> Workorders. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Link
            href="/console/crm/appointments"
            className="rounded-2xl border border-gray-200 bg-white p-6 hover:shadow-sm hover:border-gray-300 transition group flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Appointment Requests</h3>
              <p className="text-sm text-gray-500">Public website bookings, pincode routing &amp; vendor assignment</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" />
          </Link>
          <Link
            href="/console/crm/calls"
            className="rounded-2xl border border-gray-200 bg-white p-6 hover:shadow-sm hover:border-gray-300 transition group flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Appointments</h3>
              <p className="text-sm text-gray-500">Appointment entry, disposition, and follow-ups</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" />
          </Link>
          <Link
            href="/console/crm/jobsheets"
            className="rounded-2xl border border-gray-200 bg-white p-6 hover:shadow-sm hover:border-gray-300 transition group flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Workorders</h3>
              <p className="text-sm text-gray-500">Scheduled work through invoicing</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" />
          </Link>
        </div>

        {error && (
          <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
                className={`text-left rounded-2xl border bg-white p-6 transition-colors ${
                  filterValue === null ? 'cursor-default' : ''
                } ${
                  isActive
                    ? 'border-gray-900 ring-2 ring-gray-900'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-500 text-sm">{label}</span>
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-gray-700" />
                  </div>
                </div>
                <p className="text-2xl font-semibold text-gray-900">{value}</p>
              </button>
            );
          })}
        </div>

        {/* Status Filter */}
        <div className="flex gap-1 flex-wrap mb-6">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === s
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-500 hover:text-gray-900 border border-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Leads Table */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Contact</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Source</th>
                <th className="text-center px-6 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-6 py-3 text-gray-400 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                    No leads found
                  </td>
                </tr>
              ) : (
                filtered.map((lead) => (
                  <tr key={lead._id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3 font-medium text-gray-900">{lead.name}</td>
                    <td className="px-6 py-3 text-gray-500">
                      <p>{lead.email}</p>
                      {lead.phone && <p className="text-gray-400 text-xs">{lead.phone}</p>}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{lead.source ?? '—'}</td>
                    <td className="px-6 py-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[lead.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-400">{fmtDate(lead.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over: New Lead */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="flex-1 bg-gray-50/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-3xl max-h-[90vh] bg-gray-50 border border-gray-200 rounded-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">New Lead</h2>
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
              {([
                { field: 'name', label: 'Full Name *', required: true, type: 'text' },
                { field: 'email', label: 'Email', required: false, type: 'email' },
                { field: 'phone', label: 'Phone', required: false, type: 'tel' },
                { field: 'source', label: 'Source', required: false, type: 'text' },
              ] as const).map(({ field, label, required, type }) => (
                <div key={field}>
                  <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
                  <input
                    type={type}
                    required={required}
                    value={form[field]}
                    onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-white/20"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={3}
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
                Create Lead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
