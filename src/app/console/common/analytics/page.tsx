'use client'
import { useEffect, useState } from 'react'
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'

/**
 * Business-wide analytics, rebuilt on AN-CRM's own data (SalesInvoice/
 * CrmJobSheet via /api/analytics/overview) after the old version
 * of this page (built on the ecommerce Order model) was removed along
 * with the rest of AN-CRM's leftover ANgroup storefront surface area.
 *
 * The Daily/Weekly/Monthly/Yearly section below (api/analytics/trend) adds
 * the year-on-date comparison view per explicit direction ("Daily, weekly,
 * monthly and yearly and year as on date comparisons and graphs and also
 * comparison clusters on both workorders and revenue both") -- each bucket is
 * charted alongside the same bucket exactly one year earlier, for both
 * revenue and workorder volume.
 */

interface Overview {
  revenue: { total: number; totalInvoices: number; totalInvoicesAllStatuses: number; thisMonth: number; thisMonthInvoices: number }
  bySource: { source: string; revenue: number; count: number }[]
  statusBreakdown: { status: string; count: number }[]
  monthlyTrend: { label: string; revenue: number; activity: number }[]
  operations: { totalWorkorders: number; openWorkorders: number; closedWorkorders: number }
}

interface TrendBucket {
  label: string
  revenue: number
  workorders: number
  priorYearLabel: string
  priorYearRevenue: number
  priorYearWorkorders: number
}

interface TrendData {
  granularity: string
  buckets: TrendBucket[]
  summary: {
    revenue: { current: number; priorYear: number; changePct: number | null }
    workorders: { current: number; priorYear: number; changePct: number | null }
  }
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PAID: 'success', SENT: 'info', PARTIAL: 'warning', OVERDUE: 'danger', CANCELLED: 'neutral', FAILED: 'danger', DRAFT: 'neutral',
}

const PIE_COLORS = ['#5B3DF5', '#8B5CF6', '#22D3EE', '#34D399', '#F59E0B', '#F43F5E']

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
  const { businessId } = useActiveBusinessId()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  const [granularity, setGranularity] = useState<typeof GRANULARITIES[number]['key']>('MONTH')
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [trendLoading, setTrendLoading] = useState(true)

  useEffect(() => {
    if (!businessId) return
    fetch(`/api/analytics/overview?businessId=${businessId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d) })
      .finally(() => setLoading(false))
  }, [businessId])

  useEffect(() => {
    if (!businessId) return
    setTrendLoading(true)
    fetch(`/api/analytics/trend?granularity=${granularity}&businessId=${businessId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setTrend(d) })
      .finally(() => setTrendLoading(false))
  }, [granularity, businessId])

  const revenueChartData = trend?.buckets.map((b) => ({
    label: b.label,
    'This period': b.revenue,
    [`Same period last year`]: b.priorYearRevenue,
  })) || []

  const workordersChartData = trend?.buckets.map((b) => ({
    label: b.label,
    'This period': b.workorders,
    [`Same period last year`]: b.priorYearWorkorders,
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
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <StatCard label="Total Revenue" value={fmt(data.revenue.total)} sub={`${data.revenue.totalInvoices} paid invoices`} />
            <StatCard label={`This Month (${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })})`} value={fmt(data.revenue.thisMonth)} sub={`${data.revenue.thisMonthInvoices} invoices`} />
            <StatCard label="Invoices" value={String(data.revenue.totalInvoicesAllStatuses)} sub="all statuses" />
            <StatCard label="Total Workorders" value={String(data.operations.totalWorkorders)} />
            <StatCard label="Open Workorders" value={String(data.operations.openWorkorders)} />
            <StatCard label="Closed Workorders" value={String(data.operations.closedWorkorders)} />
          </div>

          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="h-section">Revenue &amp; Workorders — Year-on-Date Comparison</div>
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-ink-2">Revenue — Bar</div>
                      <ChangeBadge pct={trend.summary.revenue.changePct} />
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueChartData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="label" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <Tooltip formatter={(v) => fmt(Number(v) || 0)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="This period" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={22}>
                            <LabelList dataKey="This period" position="top" formatter={(v: any) => (v ? fmt(Number(v)) : '')} style={{ fontSize: 10, fill: 'var(--ink-2)' }} />
                          </Bar>
                          <Bar dataKey="Same period last year" fill="var(--border-strong)" radius={[4, 4, 0, 0]} barSize={22} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="text-sm font-medium text-ink-2">Revenue — Line</div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={revenueChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="label" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <Tooltip formatter={(v) => fmt(Number(v) || 0)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Line type="monotone" dataKey="This period" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }}>
                            <LabelList dataKey="This period" position="top" formatter={(v: any) => (v ? fmt(Number(v)) : '')} style={{ fontSize: 10, fill: 'var(--ink-2)' }} />
                          </Line>
                          <Line type="monotone" dataKey="Same period last year" stroke="var(--border-strong)" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-ink-2">Workorders — Bar</div>
                      <ChangeBadge pct={trend.summary.workorders.changePct} />
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={workordersChartData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="label" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="This period" fill="var(--info)" radius={[4, 4, 0, 0]} barSize={22}>
                            <LabelList dataKey="This period" position="top" formatter={(v: any) => v || ''} style={{ fontSize: 10, fill: 'var(--ink-2)' }} />
                          </Bar>
                          <Bar dataKey="Same period last year" fill="var(--border-strong)" radius={[4, 4, 0, 0]} barSize={22} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="text-sm font-medium text-ink-2">Workorders — Line</div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={workordersChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="label" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Line type="monotone" dataKey="This period" stroke="var(--info)" strokeWidth={2} dot={{ r: 3 }}>
                            <LabelList dataKey="This period" position="top" formatter={(v: any) => v || ''} style={{ fontSize: 10, fill: 'var(--ink-2)' }} />
                          </Line>
                          <Line type="monotone" dataKey="Same period last year" stroke="var(--border-strong)" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="h-section mb-4">Revenue &amp; Workorders Trend (last 6 months)</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.monthlyTrend} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revTrend6mo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                    <YAxis yAxisId="revenue" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                    <YAxis yAxisId="activity" orientation="right" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => (name === 'Revenue' ? fmt(Number(v) || 0) : v)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="revenue" dataKey="revenue" name="Revenue" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={28}>
                      <LabelList dataKey="revenue" position="top" formatter={(v: any) => (v ? fmt(Number(v)) : '')} style={{ fontSize: 10, fill: 'var(--ink-2)' }} />
                    </Bar>
                    <Area yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenue" stroke="var(--accent)" strokeWidth={2} fill="url(#revTrend6mo)" fillOpacity={0.5} legendType="none" />
                    <Line yAxisId="activity" type="monotone" dataKey="activity" name="Workorders" stroke="var(--info)" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
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
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="h-56 w-56 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.bySource} dataKey="revenue" nameKey="source"
                            innerRadius={50} outerRadius={90} paddingAngle={2}
                            label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {data.bySource.map((s, i) => <Cell key={s.source} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => fmt(Number(v) || 0)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3 flex-1 min-w-0 w-full">
                      {data.bySource.map((s, i) => (
                        <div key={s.source} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <Badge tone={s.source === 'POS' ? 'info' : 'neutral'}>{s.source}</Badge>
                          </span>
                          <span className="text-xs tabular text-ink-3">{s.count} inv.</span>
                          <span className="text-sm tabular font-medium">{fmt(s.revenue)}</span>
                        </div>
                      ))}
                    </div>
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
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="h-56 w-56 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.statusBreakdown} dataKey="count" nameKey="status"
                            innerRadius={50} outerRadius={90} paddingAngle={2}
                            label={({ value }) => String(value)}
                            labelLine={false}
                          >
                            {data.statusBreakdown.map((s, i) => <Cell key={s.status} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3 flex-1 min-w-0 w-full">
                      {data.statusBreakdown.map((s, i) => (
                        <div key={s.status} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <Badge tone={STATUS_TONE[s.status] || 'neutral'}>{s.status}</Badge>
                          </span>
                          <span className="text-sm tabular font-medium">{s.count}</span>
                        </div>
                      ))}
                    </div>
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
