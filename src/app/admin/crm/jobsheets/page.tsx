'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { formatAgeing } from '@/lib/format/ageing'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

interface JobSheet {
  _id: string
  jobSheetNumber: string
  customerName: string
  title: string
  product?: string
  deviceModel?: string
  brandId?: { name?: string } | string
  status: string
  scheduledAt?: string
  invoiceNumber?: string
  createdAt: string
  assignedTo?: { name?: string }
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
const OPEN_STATUSES = new Set(['CREATED', 'REPAIR_STARTED', 'REPAIR_IN_PROGRESS', 'REPAIR_COMPLETED'])

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function ageingDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

// Per spec: a workorder crossing day 7 without closing needs to visibly
// stand out in the list -- highlighted, not just a number.
function AgeingBadge({ js }: { js: JobSheet }) {
  if (!OPEN_STATUSES.has(js.status)) return <span className="text-gray-300 text-xs">—</span>
  const days = ageingDays(js.createdAt)
  const overdue = days >= 7
  return <Badge tone={overdue ? 'danger' : 'neutral'}>{formatAgeing(js.createdAt)}</Badge>
}

export default function JobSheetsPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('ALL')

  const qs = statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''
  const { data, isLoading: loading, error: swrError } = useSWR(`/api/crm/jobsheets${qs}`, { keepPreviousData: true })
  const jobSheets: JobSheet[] = data?.success !== false ? (data?.jobSheets || []) : []
  const error = swrError ? (swrError.message || 'Could not load job sheets.') : (data?.success === false ? (data.message || 'Failed to load job sheets') : null)

  if (loading && jobSheets.length === 0) {
    return <LoadingPanel label="Loading workorders…" />
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Workorders"
          description="Work scheduled, in progress, and invoiced"
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => router.push('/admin/crm')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
              <Button onClick={() => router.push('/admin/crm/jobsheets/new')} icon={<Plus className="w-4 h-4" />}>New Job Sheet</Button>
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

        <div className={`rounded-card border border-border bg-surface overflow-hidden overflow-x-auto transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Workorder #</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Customer</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Device</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Title</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Ageing</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Invoice</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobSheets.length === 0 ? (
                <tr><td colSpan={8}><EmptyState kind="empty" title="No workorders found" /></td></tr>
              ) : (
                jobSheets.map((js) => (
                  <tr key={js._id} className="hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => router.push(`/admin/crm/jobsheets/${js._id}`)}>
                    <td className="px-6 py-3 tabular text-xs text-ink-3">{js.jobSheetNumber}</td>
                    <td className="px-6 py-3 font-medium text-ink">{js.customerName}</td>
                    <td className="px-6 py-3 text-ink-3 text-xs">
                      {[js.product, typeof js.brandId === 'object' ? js.brandId?.name : undefined, js.deviceModel].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-6 py-3 text-ink-3">{js.title}</td>
                    <td className="px-6 py-3 text-center">
                      <Badge tone={STATUS_TONE[js.status] ?? 'neutral'}>{js.status.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-6 py-3 text-center"><AgeingBadge js={js} /></td>
                    <td className="px-6 py-3 text-ink-3 tabular text-xs">{js.invoiceNumber || '—'}</td>
                    <td className="px-6 py-3 text-ink-3">{fmtDate(js.createdAt)}</td>
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
