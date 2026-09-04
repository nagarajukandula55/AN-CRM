'use client'
import useSWR from 'swr'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * AN Group's own commercial-funnel supervision -- distinct from a
 * vendor's own business analytics (/vendor/analytics, /console/common/
 * analytics), which are about a VENDOR's revenue/workorders. This page is
 * about how the PLATFORM itself is acquiring and converting customers:
 * pricing page traffic, trial signups, checkout starts, payments,
 * upgrades, renewals, and the founding-vs-standard pricing split. Per
 * explicit direction ("this analytics page is different from vendors
 * because this is for our supervision not for vendors").
 */

const VENDOR_STATUS_LABELS: Record<string, string> = {
  APPLIED: 'Applied', PENDING: 'Pending', AGREEMENT_DRAFTED: 'Agreement Drafted',
  AGREEMENT_SENT: 'Agreement Sent', AGREEMENT_SIGNED: 'Agreement Signed',
  AGREEMENT_CANCELLED: 'Agreement Cancelled', APPROVED: 'Approved', ACTIVE: 'Active',
  INACTIVE: 'Inactive', REJECTED: 'Rejected', SUSPENDED: 'Suspended',
}
const SUB_STATUS_LABELS: Record<string, string> = {
  NOT_SET: 'No Plan Configured', UNPAID: 'Unpaid (Invoiced)', ACTIVE: 'Active (Paid)', EXPIRED: 'Expired',
}
const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter', BASIC: 'Pro', PRO: 'Pro', ULTIMATE: 'Ultimate',
}

const EVENT_LABELS: Record<string, string> = {
  PRICING_PAGE_VIEW: 'Pricing Page Views',
  TRIAL_SIGNUP: 'Trial Signups',
  PLAN_SELECTED: 'Plan Selected (pre-checkout)',
  CHECKOUT_STARTED: 'Checkout Started',
  PAYMENT_COMPLETED: 'First Payments',
  UPGRADE: 'Upgrades',
  RENEWAL: 'Renewals',
  CANCELLATION: 'Cancellations',
}
const EVENT_ORDER = ['PRICING_PAGE_VIEW', 'TRIAL_SIGNUP', 'PLAN_SELECTED', 'CHECKOUT_STARTED', 'PAYMENT_COMPLETED', 'UPGRADE', 'RENEWAL', 'CANCELLATION']

const fmtINR = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`

export default function GrowthAnalyticsPage() {
  const { data, isLoading } = useSWR('/api/admin/growth-analytics')

  if (isLoading) return <div className="p-6"><LoadingPanel label="Loading growth analytics…" /></div>
  if (!data?.success) return <div className="p-6"><Card><CardBody>Couldn&apos;t load growth analytics.</CardBody></Card></div>

  const countsByType: Record<string, number> = data.countsByType || {}
  const foundingVsStandard: { _id: boolean | null; count: number }[] = data.foundingVsStandard || []
  const revenueByFounding: { _id: boolean | null; revenue: number }[] = data.revenueByFounding || []
  const recent: any[] = data.recent || []

  const foundingCount = foundingVsStandard.find((r) => r._id === true)?.count || 0
  const standardCount = foundingVsStandard.find((r) => r._id === false)?.count || 0
  const foundingRevenue = revenueByFounding.find((r) => r._id === true)?.revenue || 0
  const standardRevenue = revenueByFounding.find((r) => r._id === false)?.revenue || 0

  const snapshot = data.vendorSnapshot || {}
  const statusCounts: { _id: string; count: number }[] = snapshot.statusCounts || []
  const subStatusCounts: { _id: string; count: number }[] = snapshot.subscriptionStatusCounts || []
  const planDistribution: { _id: string | null; count: number }[] = snapshot.planDistribution || []
  const signupsByMonth: { _id: string; count: number }[] = snapshot.signupsByMonth || []
  const maxMonthlySignups = Math.max(1, ...signupsByMonth.map((m) => m.count))
  const activePaidCount = subStatusCounts.find((s) => s._id === 'ACTIVE')?.count || 0
  const expiredCount = subStatusCounts.find((s) => s._id === 'EXPIRED')?.count || 0

  return (
    <div className="min-h-screen bg-bg text-ink p-6 space-y-6">
      <PageHeader
        title="Growth Analytics"
        description="AN Group's own commercial funnel and live vendor base — pricing traffic, trial signups, conversion, current plan mix, and churn signals. Not a vendor's own business analytics (see Vendor Analytics for that)."
      />

      <div>
        <p className="h-section mb-3">Current Vendor Base</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardBody>
            <p className="text-xs text-ink-3">Total Vendors</p>
            <p className="text-2xl font-semibold tabular text-ink mt-1">{snapshot.totalVendors ?? 0}</p>
          </CardBody></Card>
          <Card><CardBody>
            <p className="text-xs text-ink-3">New This Month</p>
            <p className="text-2xl font-semibold tabular text-ink mt-1">{snapshot.newThisMonth ?? 0}</p>
          </CardBody></Card>
          <Card><CardBody>
            <p className="text-xs text-ink-3">Active Paid Subscriptions</p>
            <p className="text-2xl font-semibold tabular text-success mt-1">{activePaidCount}</p>
          </CardBody></Card>
          <Card><CardBody>
            <p className="text-xs text-ink-3">Lapsed / Expired</p>
            <p className="text-2xl font-semibold tabular text-danger mt-1">{expiredCount}</p>
          </CardBody></Card>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardBody>
            <p className="h-section mb-2">Vendor Status</p>
            <div className="space-y-1.5">
              {statusCounts.length === 0 && <p className="text-xs text-ink-3">No vendors yet.</p>}
              {statusCounts.map((s) => (
                <div key={s._id} className="flex items-center justify-between text-sm">
                  <span className="text-ink-2">{VENDOR_STATUS_LABELS[s._id] || s._id}</span>
                  <span className="tabular font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="h-section mb-2">Billing Status</p>
            <div className="space-y-1.5">
              {subStatusCounts.length === 0 && <p className="text-xs text-ink-3">No subscriptions yet.</p>}
              {subStatusCounts.map((s) => (
                <div key={s._id} className="flex items-center justify-between text-sm">
                  <span className="text-ink-2">{SUB_STATUS_LABELS[s._id] || s._id}</span>
                  <span className="tabular font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="h-section mb-2">Plan Mix (active only)</p>
            <div className="space-y-1.5">
              {planDistribution.length === 0 && <p className="text-xs text-ink-3">No active plans yet.</p>}
              {planDistribution.map((p) => (
                <div key={String(p._id)} className="flex items-center justify-between text-sm">
                  <span className="text-ink-2">{p._id ? (PLAN_LABELS[p._id] || p._id) : 'Unset'}</span>
                  <span className="tabular font-medium">{p.count}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <p className="h-section mb-3">Vendor Signups — Last 6 Months</p>
          {signupsByMonth.length === 0 ? (
            <p className="text-xs text-ink-3">No signups in this window.</p>
          ) : (
            <div className="space-y-2">
              {signupsByMonth.map((m) => (
                <div key={m._id} className="flex items-center gap-3">
                  <span className="text-xs text-ink-3 w-16 shrink-0 tabular">{m._id}</span>
                  <div className="flex-1 h-4 bg-surface-2 rounded-control overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${(m.count / maxMonthlySignups) * 100}%` }} />
                  </div>
                  <span className="text-xs tabular text-ink-2 w-6 text-right">{m.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardBody>
            <p className="h-section mb-2">Churn Signals (last 30 days)</p>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-ink-2">Subscriptions that lapsed unpaid</span>
              <span className="tabular font-medium">{snapshot.recentlyExpiredSubscriptions ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-2">Vendors marked Suspended/Inactive/Rejected</span>
              <span className="tabular font-medium">{snapshot.recentlyLostVendors ?? 0}</span>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {EVENT_ORDER.map((type) => (
          <Card key={type}>
            <CardBody>
              <p className="text-xs text-ink-3">{EVENT_LABELS[type]}</p>
              <p className="text-2xl font-semibold tabular text-ink mt-1">{countsByType[type] || 0}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardBody>
            <p className="h-section mb-2">Trial → Paid Conversion</p>
            <p className="text-3xl font-semibold tabular text-ink">
              {data.trialToPaidConversionPct === null ? '—' : `${data.trialToPaidConversionPct}%`}
            </p>
            <p className="text-xs text-ink-3 mt-1">First payments ÷ trial signups</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="h-section mb-2">Founding vs Standard Customers</p>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-ink-2">Founding pricing</span>
              <span className="tabular font-medium">{foundingCount} paid · {fmtINR(foundingRevenue)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-2">Standard pricing</span>
              <span className="tabular font-medium">{standardCount} paid · {fmtINR(standardRevenue)}</span>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardBody>
          <p className="h-section mb-3">Recent Events</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink-3 text-xs eyebrow">
                <tr>
                  <th className="text-left py-2">Event</th>
                  <th className="text-left py-2">Plan</th>
                  <th className="text-left py-2">Period</th>
                  <th className="text-left py-2">Amount</th>
                  <th className="text-left py-2">Pricing</th>
                  <th className="text-left py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-2">{EVENT_LABELS[r.type] || r.type}</td>
                    <td className="py-2 text-ink-2">{r.planKey || '—'}</td>
                    <td className="py-2 text-ink-2">{r.billingPeriod || '—'}</td>
                    <td className="py-2 tabular text-ink-2">{r.amount ? fmtINR(r.amount) : '—'}</td>
                    <td className="py-2">
                      {r.isFoundingPricing === true && <Badge tone="success">Founding</Badge>}
                      {r.isFoundingPricing === false && <Badge tone="neutral">Standard</Badge>}
                      {r.isFoundingPricing == null && '—'}
                    </td>
                    <td className="py-2 text-ink-3">{new Date(r.createdAt).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
