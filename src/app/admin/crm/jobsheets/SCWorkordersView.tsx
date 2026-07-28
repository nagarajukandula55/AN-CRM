'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeft, Plus, Printer } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { STATUSES, STATUS_TONE, OPEN_STATUSES, ageingDays, fmtDate, type JobSheet } from './shared'

/**
 * Service Center's Workorders view -- a single-login shop, not a
 * call-center queue. No assignment column at all (there's one person
 * running this: whoever's logged in) -- ageing is the thing that matters
 * instead, since a workorder sitting past day 7 with nobody looking at it
 * is the real risk here. Distinct from BrandWorkordersView on purpose.
 */
export function SCWorkordersView() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('ALL')

  const qs = statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''
  const { data, isLoading: loading, error: swrError } = useSWR(`/api/crm/jobsheets${qs}`, { keepPreviousData: true })
  const jobSheets: JobSheet[] = data?.success !== false ? (data?.jobSheets || []) : []
  const error = swrError ? (swrError.message || 'Could not load workorders.') : (data?.success === false ? (data.message || 'Failed to load workorders') : null)

  const overdue = jobSheets.filter((js) => OPEN_STATUSES.has(js.status) && ageingDays(js.createdAt) >= 7).length

  if (loading && jobSheets.length === 0) {
    return <LoadingPanel label="Loading your workorders…" />
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Workorders"
        description="Your shop's jobs, oldest risk first."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/crm')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
            <Button onClick={() => router.push('/admin/crm/jobsheets/new')} icon={<Plus className="w-4 h-4" />}>New Job Sheet</Button>
          </>
        }
      />

      {error && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>}

      {overdue > 0 && (
        <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">
          {overdue} workorder{overdue === 1 ? '' : 's'} past 7 days and still open.
        </div>
      )}

      <div className="flex gap-1 flex-wrap mb-6">
        {STATUSES.map((s) => (
          <Button key={s} variant={statusFilter === s ? 'primary' : 'secondary'} size="sm" onClick={() => setStatusFilter(s)}>
            {s.replace(/_/g, ' ')}
          </Button>
        ))}
      </div>

      <div className={`rounded-card border border-border bg-surface overflow-hidden overflow-x-auto transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-6 py-3 text-ink-3 font-medium">Workorder #</th>
              <th className="text-left px-6 py-3 text-ink-3 font-medium">Customer</th>
              <th className="text-left px-6 py-3 text-ink-3 font-medium">Device / Issue</th>
              <th className="text-center px-6 py-3 text-ink-3 font-medium">Ageing</th>
              <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jobSheets.length === 0 ? (
              <tr><td colSpan={6}><EmptyState kind="empty" title="No workorders found" description="Add your first workorder to get started." /></td></tr>
            ) : (
              jobSheets.map((js) => {
                const days = ageingDays(js.createdAt)
                const isOverdue = OPEN_STATUSES.has(js.status) && days >= 7
                return (
                  <tr key={js._id} className="hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => router.push(`/admin/crm/jobsheets/${js._id}`)}>
                    <td className="px-6 py-3 tabular text-xs text-ink-3">{js.jobSheetNumber}</td>
                    <td className="px-6 py-3 font-medium text-ink">{js.customerName}</td>
                    <td className="px-6 py-3 text-ink-3 text-xs">
                      {[js.product, js.deviceModel].filter(Boolean).join(' · ') || '—'}{js.title ? ` — ${js.title}` : ''}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {OPEN_STATUSES.has(js.status) ? <Badge tone={isOverdue ? 'danger' : 'neutral'}>{days}d</Badge> : <span className="text-ink-3 text-xs">—</span>}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <Badge tone={STATUS_TONE[js.status] ?? 'neutral'}>{js.status.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/print/jobsheets/${js._id}`) }}
                        className="text-ink-3 hover:text-ink"
                        title="Print job card"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
