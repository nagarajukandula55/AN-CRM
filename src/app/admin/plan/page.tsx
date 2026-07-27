'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PLANS, BILLING_PERIODS, priceForPeriod, type PlanKey, type BillingPeriod } from '@/core/pricing/plans'

declare global {
  interface Window {
    Razorpay: any
  }
}

/**
 * Vendor/business-facing plan page -- current plan, days remaining, and
 * upgrade to a different tier/tenure. Per explicit direction ("This no of
 * days valid and all other details also in their plan page should be
 * there and their selected plan and also other details about plans and
 * option to upgrade to other type or other tenure plans").
 */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export default function PlanPage() {
  const { data, mutate } = useSWR('/api/subscriptions/status', (url: string) =>
    fetch(url, { credentials: 'include' }).then((r) => r.json())
  )
  const [period, setPeriod] = useState<BillingPeriod>('YEARLY')
  const [paying, setPaying] = useState<PlanKey | null>(null)
  const [error, setError] = useState('')

  async function purchase(plan: PlanKey) {
    setError('')
    setPaying(plan)
    try {
      const loaded = await loadRazorpayScript()
      if (!loaded) throw new Error('Could not load payment gateway')

      const orderRes = await fetch('/api/subscriptions/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan, billingPeriod: period }),
      })
      const orderData = await orderRes.json()
      if (!orderData.success) throw new Error(orderData.message || 'Failed to start payment')

      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount * 100,
        currency: orderData.currency,
        order_id: orderData.razorpayOrderId,
        name: 'AN-CRM',
        description: `${plan} plan — ${period}`,
        handler: async (response: any) => {
          const verifyRes = await fetch('/api/subscriptions/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              subscriptionId: orderData.subscriptionId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          })
          const verifyData = await verifyRes.json()
          if (verifyData.success) mutate()
          else setError(verifyData.message || 'Payment verification failed')
        },
        theme: { color: '#5B3DF5' },
      })
      rzp.open()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setPaying(null)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <PageHeader title="Plan & Billing" description="Your current license status and upgrade options." />

      {data?.success && (
        <Card className="mb-6">
          <CardBody className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-section">{data.plan}</span>
                <Badge tone={data.blocked ? 'danger' : data.status === 'TRIAL' ? 'info' : 'success'}>
                  {data.blocked ? 'Expired' : data.status}
                </Badge>
              </div>
              <p className="text-sm text-ink-2 mt-1">
                {data.blocked
                  ? 'Your access has been suspended. Renew to continue.'
                  : `${data.daysRemaining} day${data.daysRemaining === 1 ? '' : 's'} remaining`}
                {data.expiryDate && ` — valid until ${new Date(data.expiryDate).toLocaleDateString('en-IN')}`}
              </p>
            </div>
            {data.blocked && (
              <div className="flex items-center gap-2 text-danger text-sm">
                <AlertTriangle className="h-4 w-4" /> Renew now to restore access
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {error && <div className="mb-4 rounded-control border border-danger bg-danger-soft px-4 py-3 text-sm">{error}</div>}

      <div className="flex items-center justify-center mb-8">
        <div className="inline-flex rounded-control border border-border-strong bg-surface p-1 gap-1">
          {BILLING_PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 rounded-control text-sm font-medium transition-colors ${
                period === p.key ? 'bg-accent text-accent-fg' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PLANS.map((plan) => {
          const price = priceForPeriod(plan, period)
          const isCurrent = data?.plan === plan.key && !data?.blocked
          return (
            <Card key={plan.key} className={isCurrent ? 'border-accent' : ''}>
              <CardBody>
                <h3 className="h-section">{plan.name}</h3>
                <p className="text-ink-2 text-sm mt-1 min-h-[36px]">{plan.tagline}</p>
                <div className="mt-4 text-2xl font-semibold tabular">₹{price.perMonth.toLocaleString('en-IN')}<span className="text-sm text-ink-3">/mo</span></div>
                <ul className="space-y-1.5 mt-4 mb-5">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-ink-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={isCurrent ? 'secondary' : 'primary'}
                  disabled={isCurrent || paying === plan.key}
                  onClick={() => purchase(plan.key)}
                >
                  {isCurrent ? 'Current Plan' : paying === plan.key ? 'Processing…' : 'Upgrade'} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </CardBody>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
