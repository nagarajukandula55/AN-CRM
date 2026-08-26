'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ClipboardList,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
  CalendarRange,
  Calendar,
  CalendarClock,
  XCircle,
  Plus,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'
import { useColumnConfig } from '@/lib/hooks/useColumnConfig'

// Icon lookup for the fixed stat cards below -- useColumnConfig only
// carries key/label/visible/order (it's shared with table-column config,
// which has no icon concept), so the icon stays keyed locally by the same
// card key the super-admin config (pageKey "sc-dashboard-cards", see
// console/admin/page-columns) renames/hides/reorders.
const DASHBOARD_CARD_ICONS: Record<string, typeof ClipboardList> = {
  workordersToday: CalendarClock,
  workordersWeek: CalendarDays,
  workordersMonth: Calendar,
  workordersYear: CalendarRange,
  openWorkorders: ClipboardList,
  overdueWorkorders: AlertCircle,
  closedThisMonth: CheckCircle2,
  repairCompleted: CheckCircle2,
  partPending: AlertCircle,
  cancelledWorkorders: XCircle,
}

// Each stat card links into the jobsheets list pre-filtered to what it
// represents, reusing that page's existing ?status=/?quick=/?range= params
// (see console/sc/jobsheets/page.tsx). "Overdue" has no overdue concept on
// that list page yet, so it falls back to the plain unfiltered list rather
// than inventing new overdue-detection logic. Built from `jobsheetsPath`
// (default the console route) so this same component works unchanged
// inside the vendor portal too -- see this file's own top comment.
function buildCardHrefs(jobsheetsPath: string): Record<string, string> {
  return {
    workordersToday: `${jobsheetsPath}?range=today`,
    workordersWeek: `${jobsheetsPath}?range=week`,
    workordersMonth: `${jobsheetsPath}?range=month`,
    workordersYear: `${jobsheetsPath}?range=year`,
    openWorkorders: `${jobsheetsPath}?quick=OPEN`,
    overdueWorkorders: jobsheetsPath,
    closedThisMonth: `${jobsheetsPath}?quick=CLOSED_THIS_MONTH`,
    repairCompleted: `${jobsheetsPath}?status=REPAIR_COMPLETED`,
    partPending: `${jobsheetsPath}?status=PART_PENDING`,
    cancelledWorkorders: `${jobsheetsPath}?status=CANCELLED`,
  }
}

interface Workorder {
  _id: string
  jobSheetNumber: string
  customerName: string
  title: string
  status: string
  createdAt: string
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/**
 * SC's CRM Overview -- its actual dashboard, single-login repair shop,
 * workorders only. No appointments/leads pipeline exists here at all --
 * that was Brand's concept, and Brand/POS vendor types were removed from
 * this app entirely (SC-only platform now).
 *
 * jobsheetsPath/homePath let this SAME component render inside both
 * /console/sc/dashboard (console, businessId-scoped) and /vendor (the
 * vendor portal's Dashboard) -- previously the vendor portal had a
 * separate, much simpler reimplementation (/vendor/crm, itself never
 * linked in the nav) that used a capped 100-row list for its counts
 * instead of this page's real server-side aggregates, and had none of
 * the Today/Week/Month/Year period cards or admin-configurable card
 * set. Reported live ("CRM Overview... still few filters and data
 * missing here and that should be the dashboard not a separate
 * option"). /api/crm/jobsheets/stats is already correctly vendor-scoped
 * (resolveAuthorizedVendorScope), so no data-isolation change was
 * needed to make this safe to reuse as-is.
 */
export default function ScDashboard({
  jobsheetsPath = '/console/sc/jobsheets',
  homePath = '/console',
}: {
  jobsheetsPath?: string
  homePath?: string
} = {}) {
  const router = useRouter()
  const cardHrefs = buildCardHrefs(jobsheetsPath)
  const [gateChecked, setGateChecked] = useState(false)
  const [crmEnabled, setCrmEnabled] = useState(true)
  const [businessId, setBusinessId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => {
      const user = d.user ?? d
      setBusinessId(user?.activeBusinessId ?? d.businesses?.[0]?._id ?? null)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!businessId) return
    fetch('/api/ui/sidebar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId }),
    })
      .then(r => r.json())
      .then(d => {
        const modules = d.modules || []
        setCrmEnabled(modules.some((m: any) => String(m.key) === 'sc_jobsheets' || String(m.key) === 'sc_dashboard'))
      })
      .catch(() => setCrmEnabled(true))
      .finally(() => setGateChecked(true))
  }, [businessId])

  // Recent Activity only ever needs the newest few rows, so the capped
  // (100-row) list endpoint is fine for that. Every KPI count below comes
  // from /stats instead (real countDocuments/aggregate totals) -- a busy
  // shop with 100+ workorders in a year would otherwise silently
  // undercount "This Year" etc. if computed from this capped page.
  const { data: workordersData, isLoading: loadingWorkorders } = useSWR(
    businessId ? `/api/crm/jobsheets?businessId=${businessId}&limit=100` : null
  )
  const workorders: Workorder[] = workordersData?.jobSheets || []

  const { data: statsData, isLoading: loadingStats } = useSWR(
    businessId ? `/api/crm/jobsheets/stats?businessId=${businessId}` : null
  )
  const workorderStatusBreakdown: Record<string, number> = statsData?.byStatus || {}
  const openWorkorders = statsData?.openCount ?? 0
  const overdueWorkorders = statsData?.overdueCount ?? 0
  const closedThisMonth = statsData?.closedThisMonth ?? 0
  const workordersToday = statsData?.today ?? 0
  const workordersThisWeek = statsData?.thisWeek ?? 0
  const workordersThisMonth = statsData?.thisMonth ?? 0
  const workordersThisYear = statsData?.thisYear ?? 0

  const recentActivity = workorders
    .map(w => ({ id: w._id, kind: 'Workorder' as const, title: w.jobSheetNumber, sub: w.title, date: w.createdAt, href: `${jobsheetsPath}/${w._id}` }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8)

  const loading = !gateChecked || loadingWorkorders || loadingStats

  // Super-admin-configurable dashboard card set (rename/hide/reorder) --
  // same mechanism as the table column config (console/admin/page-columns),
  // just a different pageKey namespace. Card values are computed here since
  // they depend on live workorder data the config itself doesn't carry.
  // All-time per-status counts (not month-scoped, unlike closedThisMonth)
  // -- these three plus Open/Closed let the totals actually be reconciled
  // against each other (open + closed + cancelled + part-pending should
  // roughly track total workorders created), per explicit direction.
  const repairCompletedCount = workorderStatusBreakdown['REPAIR_COMPLETED'] ?? 0
  const partPendingCount = workorderStatusBreakdown['PART_PENDING'] ?? 0
  const cancelledCount = workorderStatusBreakdown['CANCELLED'] ?? 0

  const dashboardCardValues: Record<string, string> = {
    workordersToday: String(workordersToday),
    workordersWeek: String(workordersThisWeek),
    workordersMonth: String(workordersThisMonth),
    workordersYear: String(workordersThisYear),
    openWorkorders: String(openWorkorders),
    overdueWorkorders: String(overdueWorkorders),
    closedThisMonth: String(closedThisMonth),
    repairCompleted: String(repairCompletedCount),
    partPending: String(partPendingCount),
    cancelledWorkorders: String(cancelledCount),
  }
  const periodCards = useColumnConfig('sc-dashboard-cards-period', [
    { key: 'workordersToday', label: 'Workorders Today' },
    { key: 'workordersWeek', label: 'Workorders This Week' },
    { key: 'workordersMonth', label: 'Workorders This Month' },
    { key: 'workordersYear', label: 'Workorders This Year' },
  ])
  const summaryCards = useColumnConfig('sc-dashboard-cards-summary', [
    { key: 'openWorkorders', label: 'Open Workorders' },
    { key: 'overdueWorkorders', label: 'Overdue (7d+)' },
    { key: 'repairCompleted', label: 'Repair Completed' },
    { key: 'partPending', label: 'Part Pending' },
    { key: 'closedThisMonth', label: 'Closed This Month' },
    { key: 'cancelledWorkorders', label: 'Cancelled' },
  ])

  if (loading) {
    return <LoadingPanel label="Loading CRM overview…" />
  }

  if (gateChecked && !crmEnabled) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-3 text-center px-6">
        <AlertCircle className="w-10 h-10 text-ink-3" />
        <h2 className="h-section">CRM isn't enabled for this business</h2>
        <p className="text-sm text-ink-2 max-w-sm">Ask a Super Admin to enable the CRM module for this business from Businesses &gt; Modules.</p>
        <Button variant="secondary" className="mt-2" onClick={() => router.push(homePath)}>Go to Dashboard</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="CRM Overview"
        description="Workorders, revenue and analytics in one place"
        actions={
          <Button onClick={() => router.push(`${jobsheetsPath}/new`)} icon={<Plus className="w-4 h-4" />}>
            Create Workorder
          </Button>
        }
      />

      {/* Workorder volume by period -- created-count rollups, not revenue.
          Per explicit direction: this page is about workorder throughput,
          not money (that's Sales/Reports' job). */}
      <div className="grid-cards-auto mb-6">
        {periodCards.filter(c => c.visible).map(({ key, label }) => {
          const Icon = DASHBOARD_CARD_ICONS[key] ?? ClipboardList
          return (
            <Card key={key} className="p-6" href={cardHrefs[key]}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-ink-3 text-sm">{label}</span>
                <div className="w-8 h-8 rounded-control bg-surface-2 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-ink-2" />
                </div>
              </div>
              <p className="text-2xl font-semibold text-ink tabular">{dashboardCardValues[key] ?? '0'}</p>
            </Card>
          )
        })}
      </div>

      <div className="grid-cards-auto mb-6">
        {summaryCards.filter(c => c.visible).map(({ key, label }) => {
          const Icon = DASHBOARD_CARD_ICONS[key] ?? ClipboardList
          return (
            <Card key={key} className="p-6" href={cardHrefs[key]}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-ink-3 text-sm">{label}</span>
                <div className="w-8 h-8 rounded-control bg-surface-2 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-ink-2" />
                </div>
              </div>
              <p className="text-2xl font-semibold text-ink tabular">{dashboardCardValues[key] ?? '0'}</p>
            </Card>
          )
        })}
      </div>

      {/* Any remaining statuses not already covered by a fixed summary card
          above (REPAIR_COMPLETED/PART_PENDING/CANCELLED now have their own
          cards) -- e.g. CREATED/REPAIR_STARTED/REPAIR_IN_PROGRESS. */}
      {Object.entries(workorderStatusBreakdown).filter(([status]) => !['REPAIR_COMPLETED', 'PART_PENDING', 'CANCELLED'].includes(status)).length > 0 && (
        <div className="grid-cards-auto mb-6">
          {Object.entries(workorderStatusBreakdown)
            .filter(([status]) => !['REPAIR_COMPLETED', 'PART_PENDING', 'CANCELLED'].includes(status))
            .map(([status, count]) => (
              <Card key={status} className="p-6" href={`${jobsheetsPath}?status=${status}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-ink-3 text-sm">{status.replace(/_/g, ' ')}</span>
                  <div className="w-8 h-8 rounded-control bg-surface-2 flex items-center justify-center">
                    <ClipboardList className="w-4 h-4 text-ink-2" />
                  </div>
                </div>
                <p className="text-2xl font-semibold text-ink tabular">{count}</p>
              </Card>
            ))}
        </div>
      )}

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

      <div className="grid grid-cols-1 gap-4 mb-8">
        <Link href={jobsheetsPath}>
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
    </div>
  )
}
