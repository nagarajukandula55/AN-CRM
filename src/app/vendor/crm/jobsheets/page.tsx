'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { formatAgeing } from '@/lib/format/ageing'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'

interface JobSheet {
  _id: string
  jobSheetNumber: string
  customerName: string
  title: string
  status: string
  createdAt: string
  assignedTo?: { name?: string }
  brandId?: { name?: string; logoUrl?: string }
  deviceModel?: string
  warrantyStatus?: 'IW' | 'OOW'
  deviceAppearance?: 'GOOD' | 'USED' | 'DENTS' | 'BROKEN'
  fileBackupDescription?: 'YES' | 'NO'
  standardAccessories?: string
  specialDescription?: string
}

interface StaffMember {
  _id: string
  userId: { _id: string; name: string; email: string } | string
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  CREATED: 'info',
  REPAIR_STARTED: 'info',
  REPAIR_IN_PROGRESS: 'warning',
  PART_PENDING: 'warning',
  REPAIR_COMPLETED: 'info',
  CLOSED: 'success',
  CANCELLED: 'danger',
}

const STATUSES = ['ALL', 'CREATED', 'REPAIR_STARTED', 'REPAIR_IN_PROGRESS', 'PART_PENDING', 'REPAIR_COMPLETED', 'CLOSED', 'CANCELLED']

// Per explicit direction: Cancelled, Completed and Closed all count as
// "closed" for TAT purposes -- everything else (including Part Pending)
// is still an open workorder whose clock keeps running.
const CLOSED_STATUSES = new Set(['REPAIR_COMPLETED', 'CLOSED', 'CANCELLED'])
const TAT_HIGHLIGHT_DAYS = 3

function TatBadge({ js }: { js: JobSheet }) {
  const isOpen = !CLOSED_STATUSES.has(js.status)
  const ms = Date.now() - new Date(js.createdAt).getTime()
  const overdue = isOpen && ms >= TAT_HIGHLIGHT_DAYS * 86400000
  return <Badge tone={overdue ? 'danger' : 'neutral'}>{formatAgeing(js.createdAt)}</Badge>
}

// Which action moves a job sheet forward from its current status -- mirrors
// the real lifecycle (CREATED -[assign-engineer]-> REPAIR_STARTED
// -[start-repair]-> REPAIR_IN_PROGRESS -[close]-> REPAIR_COMPLETED
// -[handover]-> CLOSED, with PART_PENDING/resume-repair as a side branch --
// see each api/crm/jobsheets/[id]/*/route.ts's own docstring for the exact
// milestone), exposed as one quick action per row instead of a separate
// detail page. CREATED has no quick action here since assign-engineer
// needs an engineer picked, not a single click. REPAIR_IN_PROGRESS used to
// have a one-click "Close (Invoice)" here too, but that blind-closed
// whatever line items already happened to be saved -- now that the actual
// repair page (line items, Fault Phenomenon/Symptom/Solution, Mark Part
// Pending) lives at /vendor/crm/jobsheets/[id], closing from here would
// skip filling those in and invoice an empty/stale job. That status now
// only opens the detail page (see the jobSheetNumber link below).
const NEXT_ACTION: Record<string, { label: string; action: string } | undefined> = {
  REPAIR_STARTED: { label: 'Start Repair', action: 'start-repair' },
  PART_PENDING: { label: 'Resume Repair', action: 'resume-repair' },
  REPAIR_COMPLETED: { label: 'Hand Over', action: 'handover' },
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Vendor's own view of CRM Job Sheets (see /admin/crm/jobsheets) -- reuses
// the same /api/crm/jobsheets endpoint, scoped to this vendor's own team
// via assignedToIn instead of the whole business.
export default function VendorCrmJobSheetsPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [actingId, setActingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: staffRes } = useSWR('/api/vendor/staff')
  const teamIds: string[] = staffRes?.success
    ? (staffRes.staff || [])
        .map((s: StaffMember) => (typeof s.userId === 'string' ? s.userId : s.userId?._id))
        .filter(Boolean)
    : []

  const jsParams = new URLSearchParams()
  if (statusFilter !== 'ALL') jsParams.set('status', statusFilter)
  if (teamIds.length > 0) jsParams.set('assignedToIn', teamIds.join(','))
  const jobSheetsKey = teamIds.length > 0 ? `/api/crm/jobsheets?${jsParams.toString()}` : null
  const { data: jobSheetsRes, error: jobSheetsFetchError, isLoading: loading, mutate: fetchJobSheets } = useSWR(jobSheetsKey, { keepPreviousData: true })
  const jobSheets: JobSheet[] = jobSheetsRes?.success === false ? [] : (jobSheetsRes?.jobSheets || [])
  const error: string | null = actionError || (jobSheetsFetchError
    ? (jobSheetsFetchError instanceof Error ? jobSheetsFetchError.message : 'Could not load job sheets')
    : (jobSheetsRes?.success === false ? (jobSheetsRes.message || 'Failed to load job sheets') : null))

  async function runAction(jobSheetId: string, action: string) {
    setActingId(jobSheetId)
    try {
      const res = await fetch(`/api/crm/jobsheets/${jobSheetId}/${action}`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Action failed')
      setActionError(null)
      fetchJobSheets()
    } catch (err: any) {
      setActionError(err.message || 'Action failed')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Workorders"
          description="Your team's repair jobs"
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => router.push('/vendor')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
              <Button onClick={() => router.push('/vendor/crm/jobsheets/new')} icon={<Plus className="w-4 h-4" />}>New Workorder</Button>
            </>
          }
        />

        {error && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>}

        <div className="flex gap-1 flex-wrap mb-6">
          {STATUSES.map((s) => (
            <Button key={s} variant={statusFilter === s ? 'primary' : 'secondary'} size="sm" onClick={() => setStatusFilter(s)}>
              {s.replace(/_/g, ' ')}
            </Button>
          ))}
        </div>

        <div className="rounded-card border border-border bg-surface overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Workorder #</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Customer</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Issue in Device</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Device</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Assigned To</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">TAT</th>
                <th className="text-right px-6 py-3 text-ink-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center"><Spinner className="mx-auto" /></td></tr>
              ) : jobSheets.length === 0 ? (
                <tr><td colSpan={8}><EmptyState kind="empty" title="No workorders found" /></td></tr>
              ) : (
                jobSheets.map((js) => {
                  const next = NEXT_ACTION[js.status]
                  return (
                    <tr key={js._id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-6 py-3 tabular text-xs">
                        <button
                          onClick={() => router.push(`/vendor/crm/jobsheets/${js._id}`)}
                          className="text-ink-2 hover:text-ink hover:underline"
                          title="Open workorder"
                        >
                          {js.jobSheetNumber}
                        </button>
                      </td>
                      <td className="px-6 py-3 font-medium text-ink">{js.customerName}</td>
                      <td className="px-6 py-3 text-ink-3">{js.title}</td>
                      <td className="px-6 py-3 text-ink-3">
                        <div className="flex items-center gap-2">
                          {js.brandId?.logoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={js.brandId.logoUrl} alt="" className="h-5 w-5 object-contain rounded shrink-0" />
                          )}
                          <span className="truncate">
                            {[js.brandId?.name, js.deviceModel].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-ink-3 text-xs">{js.assignedTo?.name || '—'}</td>
                      <td className="px-6 py-3 text-center">
                        <Badge tone={STATUS_TONE[js.status] ?? 'neutral'}>{js.status.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-6 py-3 text-center">
                        {/* Print (Workorder/Estimate) moved off this list --
                            open the workorder itself to print from there,
                            per explicit direction. This column is now
                            Turn-Around Time: hours/minutes under 24h, days
                            beyond, highlighted once an OPEN workorder (not
                            Cancelled/Completed/Closed) crosses 3 days. */}
                        <TatBadge js={js} />
                      </td>
                      <td className="px-6 py-3 text-right">
                        {next ? (
                          <Button size="sm" onClick={() => runAction(js._id, next.action)} disabled={actingId === js._id} loading={actingId === js._id}>
                            {next.label}
                          </Button>
                        ) : js.status === 'CANCELLED' ? (
                          <span className="text-ink-3 text-xs">—</span>
                        ) : (
                          // CREATED (needs an engineer picked, not a single
                          // click) and REPAIR_IN_PROGRESS (needs the actual
                          // repair page for line items/Mark Part Pending) --
                          // both just open the detail page instead.
                          <Button size="sm" variant="secondary" onClick={() => router.push(`/vendor/crm/jobsheets/${js._id}`)}>
                            Open Workorder
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
