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
  IndianRupee,
  TrendingUp,
  Wallet,
  CalendarDays,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'

interface Workorder {
  _id: string
  jobSheetNumber: string
  customerName: string
  title: string
  status: string
  createdAt: string
}

const OPEN_WORKORDER_STATUSES = new Set(['CREATED', 'REPAIR_STARTED', 'REPAIR_IN_PROGRESS', 'REPAIR_COMPLETED'])

function ageingDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/**
 * SC's CRM Overview -- its actual dashboard, single-login repair shop,
 * workorders only. No appointments/leads pipeline exists for SC at all
 * (that's Brand's concept, see console/brand/dashboard), so none of that
 * UI lives here anymore -- this file used to serve both types with a
 * pile of `!isSC &&` branches; SC now has its own dedicated page instead.
 */
export default function ScDashboard() {
  const router = useRouter()
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

  const { data: workordersData, isLoading: loadingWorkorders } = useSWR(
    businessId ? `/api/crm/jobsheets?businessId=${businessId}&limit=100` : null
  )
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

  const openWorkorders = workorders.filter(w => OPEN_WORKORDER_STATUSES.has(w.status)).length
  const overdueWorkorders = workorders.filter(w => OPEN_WORKORDER_STATUSES.has(w.status) && ageingDays(w.createdAt) >= 7).length
  const now = new Date()
  const closedThisMonth = workorders.filter(w => {
    if (w.status !== 'CLOSED') return false
    const d = new Date(w.createdAt)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  // Every workorder CREATED this month, regardless of current status --
  // distinct from "Closed This Month" above (that's only ones finished).
  const workordersThisMonth = workorders.filter(w => {
    const d = new Date(w.createdAt)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const recentActivity = workorders
    .map(w => ({ id: w._id, kind: 'Workorder' as const, title: w.jobSheetNumber, sub: w.title, date: w.createdAt, href: `/console/sc/jobsheets/${w._id}` }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8)

  const loading = !gateChecked || loadingWorkorders

  if (loading) {
    return <LoadingPanel label="Loading CRM overview…" />
  }

  if (gateChecked && !crmEnabled) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-3 text-center px-6">
        <AlertCircle className="w-10 h-10 text-ink-3" />
        <h2 className="h-section">CRM isn't enabled for this business</h2>
        <p className="text-sm text-ink-2 max-w-sm">Ask a Super Admin to enable the CRM module for this business from Businesses &gt; Modules.</p>
        <Button variant="secondary" className="mt-2" onClick={() => router.push('/console')}>Go to Dashboard</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="CRM Overview"
        description="Workorders, revenue and analytics in one place"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { icon: CalendarDays, label: 'Workorders This Month', value: String(workordersThisMonth) },
          { icon: ClipboardList, label: 'Open Workorders', value: String(openWorkorders) },
          { icon: AlertCircle, label: 'Overdue (7d+)', value: String(overdueWorkorders) },
          { icon: CheckCircle2, label: 'Closed This Month', value: String(closedThisMonth) },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-ink-3 text-sm">{label}</span>
              <div className="w-8 h-8 rounded-control bg-surface-2 flex items-center justify-center">
                <Icon className="w-4 h-4 text-ink-2" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-ink tabular">{value}</p>
          </Card>
        ))}
      </div>

      {/* Revenue, sourced from SalesInvoices generated by CRM job-sheet
          closures (see /api/crm/revenue). */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { icon: IndianRupee, label: 'Revenue This Month', value: fmtCurrency(revenue.revenueThisMonth) },
          { icon: TrendingUp, label: 'Total Revenue', value: fmtCurrency(revenue.totalRevenue) },
          { icon: Wallet, label: 'Outstanding', value: fmtCurrency(revenue.outstanding) },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-ink-3 text-sm">{label}</span>
              <div className="w-8 h-8 rounded-control bg-surface-2 flex items-center justify-center">
                <Icon className="w-4 h-4 text-ink-2" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-ink tabular">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6">
        <Card className="p-6">
          <p className="eyebrow mb-4">Workorders by Status</p>
          {Object.keys(workorderStatusBreakdown).length === 0 ? (
            <p className="text-sm text-ink-3">No data yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(workorderStatusBreakdown).map(([status, count]) => (
                <div key={status}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-ink-2">{status}</span>
                    <span className="text-ink-3 tabular">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full"
                      style={{ width: `${workorders.length ? Math.round((count / workorders.length) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

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
        <Link href="/console/sc/jobsheets">
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
