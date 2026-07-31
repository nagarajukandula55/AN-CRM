'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * Business-wide analytics, rebuilt on AN-CRM's own data (SalesInvoice/
 * CrmCall/CrmJobSheet via /api/analytics/overview) after the old version
 * of this page (built on the ecommerce Order model) was removed along
 * with the rest of AN-CRM's leftover ANgroup storefront surface area.
 *
 * The Daily/Weekly/Monthly/Yearly section below (api/analytics/trend) adds
 * the year-on-date comparison view per explicit direction ("Daily, weekly,
 * monthly and yearly and year as on date comparisons and graphs and also
 * comparison clusters on both calls and revenue both") -- each bucket is
 * charted alongside the same bucket exactly one year earlier, for both
 * revenue and call volume.
 */

interface Overview {
  revenue: { total: number; totalInvoices: number; thisMonth: number; thisMonthInvoices: number }
  bySource: { source: string; revenue: number; count: number }[]
  statusBreakdown: { status: string; count: number }[]
  monthlyTrend: { label: string; revenue: number }[]
  operations: { totalCalls: number; openWorkorders: number; closedWorkorders: number }
}

interface TrendBucket {
  label: string
  revenue: number
  calls: number
  priorYearLabel: string
  priorYearRevenue: number
  priorYearCalls: number
}

interface TrendData {
  granularity: string
  buckets: TrendBucket[]
  summary: {
    revenue: { current: number; priorYear: number; changePct: number | null }
    calls: { current: number; priorYear: number; changePct: number | null }
  }
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PAID: 'success', SENT: 'info', PARTIAL: 'warning', OVERDUE: 'danger', CANCELLED: 'neutral', FAILED: 'danger', DRAFT: 'neutral',
}

const GRANULARITIES = [
  { key: 'DAY', label: 'Daily' },
  { key: 'WEEK', label: 'Weekly' },
  { key: 'MONTH', label: 'Monthly' },
  { key: 'YEAR', label: 'Yearly' },
] as const

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-ink-3">No prior-year data</span>
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? 'text-success' : 'text-danger'}`}>
      {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {up ? '+' : ''}{pct.toFixed(1)}% vs. same period last year
    </span>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  const [granularity, setGranularity] = useState<typeof GRANULARITIES[number]['key']>('MONTH')
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [trendLoading, setTrendLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/overview', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setTrendLoading(true)
    fetch(`/api/analytics/trend?granularity=${granularity}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setTrend(d) })
      .finally(() => setTrendLoading(false))
  }, [granularity])

  const revenueChartData = trend?.buckets.map((b) => ({
    label: b.label,
    'This period': b.revenue,
    [`Same period last year`]: b.priorYearRevenue,
  })) || []

  const callsChartData = trend?.buckets.map((b) => ({
    label: b.label,
    'This period': b.calls,
    [`Same period last year`]: b.priorYearCalls,
  })) || []

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader title="Analytics" description="Revenue and operations across CRM and POS, in one view." />

      {loading ? (
        <LoadingPanel label="Loading analytics…" />
      ) : !data ? (
        <Card><CardBody>Couldn't load analytics.</CardBody></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Total Revenue" value={fmt(data.revenue.total)} sub={`${data.revenue.totalInvoices} paid invoices`} />
            <StatCard label="This Month" value={fmt(data.revenue.thisMonth)} sub={`${data.revenue.thisMonthInvoices} invoices`} />
            <StatCard label="Total Calls" value={String(data.operations.totalCalls)} />
            <StatCard label="Open Workorders" value={String(data.operations.openWorkorders)} />
            <StatCard label="Closed Workorders" value={String(data.operations.closedWorkorders)} />
          </div>

          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="h-section">Revenue &amp; Calls — Year-on-Date Comparison</div>
                <div className="inline-flex rounded-control border border-border-strong bg-surface p-1 gap-1">
                  {GRANULARITIES.map((g) => (
                    <button
                      key={g.key}
                      onClick={() => setGranularity(g.key)}
                      className={`px-3 py-1.5 rounded-control text-xs font-medium transition-colors ${
                        granularity === g.key ? 'bg-accent text-accent-fg' : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {trendLoading ? (
                <LoadingPanel label="Loading trend…" />
              ) : !trend ? (
                <p className="text-sm text-ink-3">Couldn't load trend data.</p>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-ink-2">Revenue</div>
                      <ChangeBadge pct={trend.summary.revenue.changePct} />
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="label" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <Tooltip formatter={(v) => fmt(Number(v) || 0)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="This period" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Same period last year" fill="var(--border-strong)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-ink-2">Calls</div>
                      <ChangeBadge pct={trend.summary.calls.changePct} />
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={callsChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="label" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="This period" fill="var(--info)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Same period last year" fill="var(--border-strong)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="h-section mb-4">Revenue Trend (last 6 months)</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                    <Tooltip formatter={(v) => fmt(Number(v) || 0)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Bar dataKey="revenue" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardBody>
                <div className="h-section mb-4">Revenue by Source</div>
                {data.bySource.length === 0 ? (
                  <p className="text-sm text-ink-3">No paid invoices yet.</p>
                ) : (
                  <div className="space-y-3">
                    {data.bySource.map((s) => (
                      <div key={s.source} className="flex items-center justify-between">
                        <Badge tone={s.source === 'POS' ? 'info' : 'neutral'}>{s.source}</Badge>
                        <span className="text-sm tabular text-ink-2">{s.count} invoices</span>
                        <span className="text-sm tabular font-medium">{fmt(s.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <div className="h-section mb-4">Invoice Status Breakdown</div>
                {data.statusBreakdown.length === 0 ? (
                  <p className="text-sm text-ink-3">No invoices yet.</p>
                ) : (
                  <div className="space-y-3">
                    {data.statusBreakdown.map((s) => (
                      <div key={s.status} className="flex items-center justify-between">
                        <Badge tone={STATUS_TONE[s.status] || 'neutral'}>{s.status}</Badge>
                        <span className="text-sm tabular font-medium">{s.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardBody>
        <div className="eyebrow">{label}</div>
        <div className="text-xl font-semibold tabular mt-1">{value}</div>
        {sub && <div className="text-xs text-ink-3 mt-1">{sub}</div>}
      </CardBody>
    </Card>
  )
}
