'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * Business-wide analytics, rebuilt on AN-CRM's own data (SalesInvoice/
 * CrmCall/CrmJobSheet via /api/analytics/overview) after the old version
 * of this page (built on the ecommerce Order model) was removed along
 * with the rest of AN-CRM's leftover ANgroup storefront surface area.
 */

interface Overview {
  revenue: { total: number; totalInvoices: number; thisMonth: number; thisMonthInvoices: number }
  bySource: { source: string; revenue: number; count: number }[]
  statusBreakdown: { status: string; count: number }[]
  monthlyTrend: { label: string; revenue: number }[]
  operations: { totalCalls: number; openWorkorders: number; closedWorkorders: number }
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PAID: 'success', SENT: 'info', PARTIAL: 'warning', OVERDUE: 'danger', CANCELLED: 'neutral', FAILED: 'danger', DRAFT: 'neutral',
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/overview', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-bg text-ink">
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
