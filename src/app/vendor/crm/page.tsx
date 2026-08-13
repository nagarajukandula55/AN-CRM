'use client'

/**
 * Vendor-side CRM Overview -- the landing page for Engineer/CCO vendor-team
 * members (see src/app/login/page.tsx's redirect logic). Mirrors
 * src/app/console/crm/page.tsx's stats/recent-activity structure, but scoped
 * to this vendor's own team (same `assignedToIn` teamIds pattern the
 * existing /vendor/crm/calls and /vendor/crm/jobsheets list pages already
 * use) instead of a whole business -- Engineer/CCO previously landed on
 * the generic Owner/Manager sales dashboard (/vendor), which showed
 * nothing relevant to their role.
 */

import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'

interface StaffMember { _id: string; userId: { _id: string } | string }
interface Workorder { _id: string; jobSheetNumber: string; customerName: string; title: string; status: string; createdAt: string }

const OPEN_WORKORDER_STATUSES = new Set(['CREATED', 'REPAIR_STARTED', 'REPAIR_IN_PROGRESS', 'REPAIR_COMPLETED'])

function ageingDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export default function VendorCrmOverviewPage() {
  const router = useRouter()

  const { data: staffRes } = useSWR('/api/vendor/staff')
  const teamIds: string[] = staffRes?.success
    ? (staffRes.staff || [])
        .map((s: StaffMember) => (typeof s.userId === 'string' ? s.userId : s.userId?._id))
        .filter(Boolean)
    : []

  const listParams = new URLSearchParams({ assignedToIn: teamIds.join(','), limit: '100' })
  const listKey = teamIds.length > 0 ? listParams.toString() : null
  const { data: jobsRes, isLoading: loadingJobs } = useSWR(listKey ? `/api/crm/jobsheets?${listKey}` : null)
  const workorders: Workorder[] = jobsRes?.jobSheets || []
  const loading = loadingJobs

  const workorderStatusBreakdown = workorders.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] || 0) + 1
    return acc
  }, {})

  const openWorkorders = workorders.filter((w) => OPEN_WORKORDER_STATUSES.has(w.status)).length
  const overdueWorkorders = workorders.filter((w) => OPEN_WORKORDER_STATUSES.has(w.status) && ageingDays(w.createdAt) >= 7).length
  const now = new Date()
  const closedThisMonth = workorders.filter((w) => {
    if (w.status !== 'CLOSED') return false
    const d = new Date(w.createdAt)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const recentActivity = [
    ...workorders.map((w) => ({ id: w._id, kind: 'Workorder' as const, title: w.jobSheetNumber, sub: w.title, date: w.createdAt, href: `/vendor/crm/jobsheets/${w._id}` })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8)

  if (loading) {
    return <LoadingPanel label="Loading CRM overview…" />
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader title="CRM Overview" description="Your team's workorders" />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { icon: ClipboardList, label: 'Open Workorders', value: String(openWorkorders) },
            { icon: AlertCircle, label: 'Overdue (7d+)', value: String(overdueWorkorders) },
            { icon: CheckCircle2, label: 'Closed This Month', value: String(closedThisMonth) },
          ].map(({ icon: Icon, label, value }) => (
            <Card key={label} className="p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-ink-3 text-sm">{label}</span>
                <div className="w-8 h-8 rounded-control bg-accent-soft flex items-center justify-center">
                  <Icon className="w-4 h-4 text-accent" />
                </div>
              </div>
              <p className="tabular text-2xl font-semibold text-ink">{value}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {[
            { title: 'Workorders by Status', data: workorderStatusBreakdown, total: workorders.length },
          ].map(({ title, data, total }) => (
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
                        <span className="text-ink-3">{count}</span>
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
              {recentActivity.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => router.push(item.href)}
                  className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Badge tone="success">{item.kind}</Badge>
                    <span className="text-sm font-medium text-ink">{item.title}</span>
                    <span className="text-sm text-ink-3">{item.sub}</span>
                  </div>
                  <span className="text-xs text-ink-3">{fmtDate(item.date)}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/vendor/crm/jobsheets">
            <Card className="p-6 hover:shadow-card-lg hover:border-accent/40 transition group flex items-center gap-4">
              <div className="w-11 h-11 rounded-control bg-accent-soft text-accent flex items-center justify-center">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-ink">Workorders</h3>
                <p className="text-sm text-ink-3">Scheduled work through invoicing</p>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-ink transition-colors" />
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}
