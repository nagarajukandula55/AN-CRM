'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Phone, Clock, AlertCircle,
} from 'lucide-react'
import { formatAgeing } from '@/lib/format/ageing'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

interface Call {
  _id: string
  callNumber: string
  customerName: string
  company?: string
  phone: string
  email?: string
  subject: string
  product?: string
  deviceModel?: string
  brandId?: { name?: string } | string
  status: string
  priority: string
  nextFollowUpAt?: string
  createdAt: string
  assignedTo?: { name?: string; email?: string }
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  NEW: 'info',
  CONTACTED: 'warning',
  QUALIFIED: 'info',
  JOB_CREATED: 'info',
  IN_PROGRESS: 'warning',
  CLOSED_WON: 'success',
  CLOSED_LOST: 'danger',
  NOT_INTERESTED: 'neutral',
  NO_RESPONSE: 'neutral',
}

const OPEN_STATUSES = new Set(['NEW', 'CONTACTED', 'QUALIFIED', 'IN_PROGRESS'])

const PRIORITY_TONE: Record<string, Tone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
}

const STATUSES = ['ALL', 'NEW', 'CONTACTED', 'QUALIFIED', 'JOB_CREATED', 'IN_PROGRESS', 'CLOSED_WON', 'CLOSED_LOST', 'NOT_INTERESTED', 'NO_RESPONSE']

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Ageing since creation, in whole days. Only meaningful while the
// appointment is still open (not yet dispositioned/converted) -- per spec,
// an appointment crossing day 2 should visibly flag as overdue attention.
function ageingDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

function AgeingBadge({ call }: { call: Call }) {
  if (!OPEN_STATUSES.has(call.status)) return <span className="text-ink-3 text-xs">—</span>
  const days = ageingDays(call.createdAt)
  const overdue = days >= 2
  return <Badge tone={overdue ? 'danger' : 'neutral'}>{formatAgeing(call.createdAt)}</Badge>
}

export default function CrmCallsPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('ALL')

  // A super admin browsing with no active business selected (the "all
  // businesses" view) has no x-active-business-id header, so POST /api/crm/calls
  // would 400 on "businessId is required". Same resolution pattern as
  // admin/employees/page.tsx: read it from /api/auth/me and gate creation
  // on it being present, rather than letting the request fail.
  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = (() => {
    if (!meData) return null
    const user = meData.user ?? meData
    return user.activeBusinessId ?? meData.businesses?.[0]?._id ?? null
  })()

  const qs = statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''
  const { data: callsData, error: callsErr, isLoading: loading } = useSWR(
    `/api/crm/calls${qs}`,
    { keepPreviousData: true }
  )
  const calls: Call[] = callsData?.calls || []
  const statusCounts: Record<string, number> = callsData?.statusCounts || {}
  const error = callsErr ? (callsErr.message || 'Could not load appointments. Please try again.') : null

  const totalOpen = Object.entries(statusCounts)
    .filter(([k]) => !['CLOSED_WON', 'CLOSED_LOST', 'NOT_INTERESTED', 'NO_RESPONSE'].includes(k))
    .reduce((s, [, v]) => s + v, 0)
  const won = statusCounts.CLOSED_WON || 0
  const lost = statusCounts.CLOSED_LOST || 0
  const followUpDue = calls.filter((c) => c.nextFollowUpAt && new Date(c.nextFollowUpAt) <= new Date()).length

  if (loading && calls.length === 0) {
    return <LoadingPanel label="Loading appointments…" />
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Appointments"
          description="Appointment entry, disposition, and follow-up pipeline"
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => router.push('/console/crm')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
              <Button variant="secondary" onClick={() => router.push('/console/crm/jobsheets/new')} icon={<Plus className="w-4 h-4" />}>New Job Sheet</Button>
              <Button
                onClick={() => router.push('/console/crm/calls/new')}
                disabled={!businessId}
                title={businessId ? undefined : 'Select a business first to create a call'}
                icon={<Plus className="w-4 h-4" />}
              >
                New Appointment
              </Button>
            </>
          }
        />

        {!businessId && (
          <div className="mb-6 rounded-control border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            No business selected — showing appointments across all businesses. Select a business (top-right switcher) to create a new appointment.
          </div>
        )}

        {error && (
          <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Phone, label: 'Open Appointments', value: String(totalOpen), filterValue: null },
            { icon: Clock, label: 'Follow-ups Due', value: String(followUpDue), filterValue: null },
            { icon: AlertCircle, label: 'Closed Won', value: String(won), filterValue: 'CLOSED_WON' },
            { icon: AlertCircle, label: 'Closed Lost', value: String(lost), filterValue: 'CLOSED_LOST' },
          ].map(({ icon: Icon, label, value, filterValue }) => {
            const isActive = filterValue !== null && statusFilter === filterValue;
            return (
              <Card
                key={label}
                className={`p-6 ${filterValue === null ? 'cursor-default' : 'cursor-pointer'} ${isActive ? 'border-accent ring-2 ring-accent-soft' : 'hover:border-border-strong'}`}
              >
                <button
                  type="button"
                  disabled={filterValue === null}
                  onClick={() => filterValue && setStatusFilter(statusFilter === filterValue ? 'ALL' : filterValue)}
                  className="text-left w-full"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-ink-3 text-sm">{label}</span>
                    <div className="w-8 h-8 rounded-control bg-accent-soft flex items-center justify-center">
                      <Icon className="w-4 h-4 text-accent" />
                    </div>
                  </div>
                  <p className="tabular text-2xl font-semibold text-ink">{value}</p>
                </button>
              </Card>
            );
          })}
        </div>

        <div className="flex gap-1 flex-wrap mb-6">
          {STATUSES.map((s) => (
            <Button key={s} variant={statusFilter === s ? 'primary' : 'secondary'} size="sm" onClick={() => setStatusFilter(s)}>
              {s.replace(/_/g, ' ')}{statusCounts[s] ? ` (${statusCounts[s]})` : ''}
            </Button>
          ))}
        </div>

        <div className={`rounded-card border border-border bg-surface overflow-hidden overflow-x-auto transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Appt #</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Customer</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Device</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Issue</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Priority</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Ageing</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {calls.length === 0 ? (
                <tr><td colSpan={8}><EmptyState kind="empty" title="No appointments found" /></td></tr>
              ) : (
                calls.map((call) => (
                  <tr
                    key={call._id}
                    className="hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => router.push(`/console/crm/calls/${call._id}`)}
                  >
                    <td className="px-6 py-3 tabular text-xs text-ink-3">{call.callNumber}</td>
                    <td className="px-6 py-3 font-medium text-ink">
                      {call.customerName}
                      <p className="text-ink-3 text-xs">{call.phone}</p>
                    </td>
                    <td className="px-6 py-3 text-ink-3 text-xs">
                      {[call.product, typeof call.brandId === 'object' ? call.brandId?.name : undefined, call.deviceModel].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-6 py-3 text-ink-3">{call.subject}</td>
                    <td className="px-6 py-3 text-center">
                      <Badge tone={PRIORITY_TONE[call.priority] ?? 'neutral'}>{call.priority}</Badge>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <Badge tone={STATUS_TONE[call.status] ?? 'neutral'}>{call.status.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-6 py-3 text-center"><AgeingBadge call={call} /></td>
                    <td className="px-6 py-3 text-ink-3">{fmtDate(call.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
