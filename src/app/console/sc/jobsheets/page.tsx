'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

interface JobSheetRow {
  _id: string
  jobSheetNumber: string
  customerName: string
  phone: string
  title?: string
  status: string
  createdAt: string
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  CREATED: 'info',
  REPAIR_STARTED: 'warning',
  REPAIR_IN_PROGRESS: 'warning',
  PART_PENDING: 'danger',
  REPAIR_COMPLETED: 'success',
  CLOSED: 'success',
  CANCELLED: 'neutral',
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function JobSheetsListPage() {
  const router = useRouter()
  const { businessId } = useActiveBusinessId()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')

  const params = new URLSearchParams()
  if (businessId) params.set('businessId', businessId)
  if (status !== 'ALL') params.set('status', status)
  if (search.trim()) params.set('search', search.trim())
  params.set('limit', '100')

  const { data, isLoading } = useSWR(businessId ? `/api/crm/jobsheets?${params.toString()}` : null)
  const jobSheets: JobSheetRow[] = data?.jobSheets || data?.data || []

  return (
    <div className="min-h-screen bg-bg text-ink">
      <PageHeader
        title="Workorders"
        description="Every job sheet for this business — search, filter, and open one to view or continue working it."
        actions={
          <Button onClick={() => router.push('/console/sc/jobsheets/new')} icon={<Plus className="w-4 h-4" />}>
            Create Workorder
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input
            className="pl-9"
            placeholder="Search by customer name, phone, or job sheet number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="ALL">All statuses</option>
          {Object.keys(STATUS_TONE).map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <LoadingPanel label="Loading workorders…" />
      ) : jobSheets.length === 0 ? (
        <EmptyState kind={search || status !== 'ALL' ? 'search' : 'empty'} title="No workorders found" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-3 text-xs eyebrow">
                <tr>
                  <th className="text-left px-4 py-3">Job Sheet #</th>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">Phone</th>
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobSheets.map((job) => (
                  <tr
                    key={job._id}
                    className="border-t border-border hover:bg-surface-2 cursor-pointer"
                    onClick={() => router.push(`/console/sc/jobsheets/${job._id}`)}
                  >
                    <td className="px-4 py-3 tabular font-medium">{job.jobSheetNumber}</td>
                    <td className="px-4 py-3">{job.customerName}</td>
                    <td className="px-4 py-3 tabular text-ink-2">{job.phone}</td>
                    <td className="px-4 py-3 text-ink-2">{job.title || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[job.status] || 'neutral'}>{statusLabel(job.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{new Date(job.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
