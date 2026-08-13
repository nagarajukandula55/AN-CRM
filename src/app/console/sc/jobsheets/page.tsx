'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Plus, Search, Download, Eye, Printer, FileText } from 'lucide-react'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { useColumnConfig } from '@/lib/hooks/useColumnConfig'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { openPrintPopup } from '@/lib/openPrintPopup'

interface JobSheetRow {
  _id: string
  jobSheetNumber: string
  customerName: string
  phone: string
  title?: string
  status: string
  createdAt: string
  handedOverAt?: string
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

const OPEN_STATUSES = new Set(['CREATED', 'REPAIR_STARTED', 'REPAIR_IN_PROGRESS', 'REPAIR_COMPLETED', 'PART_PENDING'])

// Default column set for this page's pageKey ("jobsheets") -- super admin
// can toggle visibility/order/labels for these via Admin > Page Columns
// (src/app/console/admin/page-columns). Defaults win for any key not yet
// present in a saved config.
const JOBSHEETS_DEFAULT_COLUMNS = [
  { key: 'jobSheetNumber', label: 'Job Sheet #' },
  { key: 'customerName', label: 'Customer' },
  { key: 'phone', label: 'Phone' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'tat', label: 'TAT' },
  { key: 'createdAt', label: 'Created' },
  { key: 'actions', label: 'Actions' },
]

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Turnaround time -- createdAt to handedOverAt if closed, else to now. */
function tatLabel(job: JobSheetRow): string {
  const from = new Date(job.createdAt).getTime()
  const to = job.status === 'CLOSED' && job.handedOverAt ? new Date(job.handedOverAt).getTime() : Date.now()
  const hours = (to - from) / 3600000
  if (hours < 1) return `${Math.max(1, Math.round((to - from) / 60000))}m`
  if (hours < 48) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function csvEscape(value: unknown): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportCsv(rows: JobSheetRow[]) {
  const header = ['Job Sheet #', 'Customer', 'Phone', 'Title', 'Status', 'TAT', 'Created']
  const lines = [header.join(',')]
  for (const job of rows) {
    lines.push([
      job.jobSheetNumber,
      job.customerName,
      job.phone,
      job.title || '',
      statusLabel(job.status),
      tatLabel(job),
      new Date(job.createdAt).toLocaleDateString(),
    ].map(csvEscape).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workorders-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function JobSheetsListPage() {
  const router = useRouter()
  const { businessId } = useActiveBusinessId()
  const columns = useColumnConfig('jobsheets', JOBSHEETS_DEFAULT_COLUMNS).filter((c) => c.visible)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')

  const params = new URLSearchParams()
  if (businessId) params.set('businessId', businessId)
  if (status !== 'ALL') params.set('status', status)
  if (search.trim()) params.set('search', search.trim())
  params.set('limit', '100')

  const { data, isLoading } = useSWR(businessId ? `/api/crm/jobsheets?${params.toString()}` : null)
  const jobSheets: JobSheetRow[] = data?.jobSheets || data?.data || []

  const kpis = useMemo(() => {
    const now = new Date()
    const total = jobSheets.length
    const open = jobSheets.filter((j) => OPEN_STATUSES.has(j.status)).length
    const closedThisMonth = jobSheets.filter((j) => {
      if (j.status !== 'CLOSED') return false
      const d = new Date(j.createdAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
    const partPending = jobSheets.filter((j) => j.status === 'PART_PENDING').length
    return { total, open, closedThisMonth, partPending }
  }, [jobSheets])

  // "Open" and "Part Pending" aren't single CrmJobSheet statuses (Open
  // spans CREATED/REPAIR_STARTED/REPAIR_IN_PROGRESS/REPAIR_COMPLETED/
  // PART_PENDING), so their cards clear the server-side status filter and
  // filter client-side instead; Closed maps directly to one real status.
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'OPEN' | 'CLOSED_THIS_MONTH' | 'PART_PENDING'>('ALL')
  const displayedJobSheets = useMemo(() => {
    const now = new Date()
    switch (quickFilter) {
      case 'OPEN':
        return jobSheets.filter((j) => OPEN_STATUSES.has(j.status))
      case 'CLOSED_THIS_MONTH':
        return jobSheets.filter((j) => {
          if (j.status !== 'CLOSED') return false
          const d = new Date(j.createdAt)
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        })
      case 'PART_PENDING':
        return jobSheets.filter((j) => j.status === 'PART_PENDING')
      default:
        return jobSheets
    }
  }, [jobSheets, quickFilter])

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Workorders"
        description="Every job sheet for this business — search, filter, and open one to view or continue working it."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => exportCsv(displayedJobSheets)}
              disabled={displayedJobSheets.length === 0}
              icon={<Download className="w-4 h-4" />}
            >
              Export
            </Button>
            <Button onClick={() => router.push('/console/sc/jobsheets/new')} icon={<Plus className="w-4 h-4" />}>
              Create Workorder
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card
          className={`cursor-pointer transition-colors ${quickFilter === 'ALL' ? 'ring-2 ring-accent' : 'hover:bg-surface-2'}`}
          onClick={() => setQuickFilter('ALL')}
        >
          <CardBody>
            <p className="eyebrow text-ink-3">Total (filtered)</p>
            <p className="text-2xl font-semibold mt-1 tabular">{kpis.total}</p>
          </CardBody>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${quickFilter === 'OPEN' ? 'ring-2 ring-accent' : 'hover:bg-surface-2'}`}
          onClick={() => setQuickFilter('OPEN')}
        >
          <CardBody>
            <p className="eyebrow text-ink-3">Open</p>
            <p className="text-2xl font-semibold mt-1 tabular">{kpis.open}</p>
          </CardBody>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${quickFilter === 'CLOSED_THIS_MONTH' ? 'ring-2 ring-accent' : 'hover:bg-surface-2'}`}
          onClick={() => setQuickFilter('CLOSED_THIS_MONTH')}
        >
          <CardBody>
            <p className="eyebrow text-ink-3">Closed This Month</p>
            <p className="text-2xl font-semibold mt-1 tabular">{kpis.closedThisMonth}</p>
          </CardBody>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${quickFilter === 'PART_PENDING' ? 'ring-2 ring-accent' : 'hover:bg-surface-2'}`}
          onClick={() => setQuickFilter('PART_PENDING')}
        >
          <CardBody>
            <p className="eyebrow text-ink-3">Part Pending</p>
            <p className="text-2xl font-semibold mt-1 tabular">{kpis.partPending}</p>
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input
            className="pl-9"
            placeholder="Search by customer name, phone, or job sheet number…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setQuickFilter('ALL') }}
          />
        </div>
        <select
          className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setQuickFilter('ALL') }}
        >
          <option value="ALL">All statuses</option>
          {Object.keys(STATUS_TONE).map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <LoadingPanel label="Loading workorders…" />
      ) : displayedJobSheets.length === 0 ? (
        <EmptyState kind={search || status !== 'ALL' || quickFilter !== 'ALL' ? 'search' : 'empty'} title="No workorders found" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-3 text-xs eyebrow">
                <tr>
                  {columns.map((col) => (
                    <th key={col.key} className="text-left px-4 py-3">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedJobSheets.map((job) => {
                  const cellFor = (key: string) => {
                    switch (key) {
                      case 'jobSheetNumber':
                        return <td key={key} className="px-4 py-3 tabular font-medium">{job.jobSheetNumber}</td>
                      case 'customerName':
                        return <td key={key} className="px-4 py-3">{job.customerName}</td>
                      case 'phone':
                        return <td key={key} className="px-4 py-3 tabular text-ink-2">{job.phone}</td>
                      case 'title':
                        return <td key={key} className="px-4 py-3 text-ink-2">{job.title || '—'}</td>
                      case 'status':
                        return (
                          <td key={key} className="px-4 py-3">
                            <Badge tone={STATUS_TONE[job.status] || 'neutral'}>{statusLabel(job.status)}</Badge>
                          </td>
                        )
                      case 'tat':
                        return <td key={key} className="px-4 py-3 tabular text-ink-2">{tatLabel(job)}</td>
                      case 'createdAt':
                        return <td key={key} className="px-4 py-3 text-ink-2">{new Date(job.createdAt).toLocaleDateString()}</td>
                      case 'actions':
                        return (
                          <td key={key} className="px-4 py-3">
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                title="View"
                                className="p-1.5 rounded-control hover:bg-surface-3 text-ink-2"
                                onClick={() => router.push(`/console/sc/jobsheets/${job._id}`)}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                title="Print Workorder"
                                className="p-1.5 rounded-control hover:bg-surface-3 text-ink-2"
                                onClick={() => openPrintPopup(`/print/jobsheets/${job._id}`)}
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                title="Print Estimate"
                                className="p-1.5 rounded-control hover:bg-surface-3 text-ink-2"
                                onClick={() => openPrintPopup(`/print/jobsheets/${job._id}?doc=estimate`)}
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )
                      default:
                        return <td key={key} className="px-4 py-3">—</td>
                    }
                  }
                  return (
                    <tr
                      key={job._id}
                      className="border-t border-border hover:bg-surface-2 cursor-pointer"
                      onClick={() => router.push(`/console/sc/jobsheets/${job._id}`)}
                    >
                      {columns.map((col) => cellFor(col.key))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
