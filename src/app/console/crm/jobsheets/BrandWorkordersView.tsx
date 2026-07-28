'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeft, Plus } from 'lucide-react'
import { formatAgeing } from '@/lib/format/ageing'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { STATUSES, STATUS_TONE, fmtDate, tatLabel, type JobSheet } from './shared'

/**
 * Brand's Workorders view -- a call-center queue across multiple centers,
 * multiple technicians. Assignment is the whole point: a workorder with
 * nobody on it is a visible gap, not just an empty cell. Distinct from
 * SCWorkordersView (single-login shop, no assignment concept at all) --
 * genuinely different pages, not one table with a hidden column.
 */
export function BrandWorkordersView() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('ALL')

  const qs = statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''
  const { data, isLoading: loading, error: swrError } = useSWR(`/api/crm/jobsheets${qs}`, { keepPreviousData: true })
  const jobSheets: JobSheet[] = data?.success !== false ? (data?.jobSheets || []) : []
  const error = swrError ? (swrError.message || 'Could not load workorders.') : (data?.success === false ? (data.message || 'Failed to load workorders') : null)

  const unassigned = jobSheets.filter((js) => !js.assignedTo && !['CLOSED', 'CANCELLED'].includes(js.status)).length

  if (loading && jobSheets.length === 0) {
    return <LoadingPanel label="Loading the call-center queue…" />
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Workorders"
        description="Every center, every technician, one queue."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => router.push('/console/crm')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
            <Button onClick={() => router.push('/console/crm/jobsheets/new')} icon={<Plus className="w-4 h-4" />}>New Job Sheet</Button>
          </>
        }
      />

      {error && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>}

      {unassigned > 0 && (
        <div className="mb-6 text-sm text-warning bg-warning-soft border border-warning/20 rounded-control px-4 py-3">
          {unassigned} workorder{unassigned === 1 ? '' : 's'} waiting for a technician to be assigned.
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
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-6 py-3 text-sm text-ink-3 font-medium">Workorder #</th>
              <th className="text-left px-6 py-3 text-sm text-ink-3 font-medium">Customer</th>
              <th className="text-left px-6 py-3 text-sm text-ink-3 font-medium">Device</th>
              <th className="text-left px-6 py-3 text-sm text-ink-3 font-medium">Technician</th>
              <th className="text-center px-6 py-3 text-sm text-ink-3 font-medium">Status</th>
              <th className="text-center px-6 py-3 text-sm text-ink-3 font-medium">Ageing</th>
              <th className="text-center px-6 py-3 text-sm text-ink-3 font-medium">TAT</th>
              <th className="text-left px-6 py-3 text-sm text-ink-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jobSheets.length === 0 ? (
              <tr><td colSpan={8}><EmptyState kind="empty" title="No workorders found" /></td></tr>
            ) : (
              jobSheets.map((js) => (
                <tr key={js._id} className="hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => router.push(`/console/crm/jobsheets/${js._id}`)}>
                  <td className="px-6 py-4 tabular text-sm text-ink-3">{js.jobSheetNumber}</td>
                  <td className="px-6 py-4 font-medium text-ink">{js.customerName}</td>
                  <td className="px-6 py-4 text-ink-2 text-sm">
                    {[js.product, typeof js.brandId === 'object' ? js.brandId?.name : undefined, js.deviceModel].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-6 py-3">
                    {js.assignedTo?.name ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-accent-soft text-accent flex items-center justify-center text-[10px] font-bold">
                          {js.assignedTo.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="text-ink-2">{js.assignedTo.name}</span>
                      </span>
                    ) : (
                      <span className="text-warning text-sm font-medium">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Badge tone={STATUS_TONE[js.status] ?? 'neutral'}>{js.status.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-ink-3">{formatAgeing(js.createdAt)}</td>
                  <td className="px-6 py-4 text-center text-xs text-ink-3 tabular">{tatLabel(js.createdAt, js.completedAt)}</td>
                  <td className="px-6 py-4 text-ink-3">{fmtDate(js.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
