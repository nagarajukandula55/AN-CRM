'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Plus, X, Building2, ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { PLANS_BY_MODE, BILLING_PERIODS, priceForPeriod, type PlanKey, type BillingPeriod } from '@/core/pricing/plans'

declare global {
  interface Window { Razorpay: any }
}

/**
 * SC-only page: an SC business's single login can spin up ANOTHER SC
 * business under itself, gated on a paid subscription addon charge --
 * mirrors the vendor "sub-vendor" flow (console/vendors/page.tsx +
 * api/vendors/[id]/sub-vendors), just at the Business level instead of
 * VendorProfile, since SC has no vendor/staff hierarchy of its own. See
 * api/businesses/[id]/sub-accounts/route.ts's top comment for the full
 * payment-then-create flow this page drives.
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

interface SubAccount {
  _id: string
  name: string
  businessCode: string
  email?: string
  phone?: string
  createdAt: string
}

export default function SubAccountsPage() {
  const { businessId } = useActiveBusinessId()
  const { data, mutate, isLoading } = useSWR(
    businessId ? `/api/businesses/${businessId}/sub-accounts` : null,
    (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())
  )
  const subAccounts: SubAccount[] = data?.success ? data.subAccounts || [] : []

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [plan, setPlan] = useState<PlanKey>('BASIC')
  const [period, setPeriod] = useState<BillingPeriod>('YEARLY')
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  const PLANS = PLANS_BY_MODE.SC

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!businessId) return
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Business name, email and password are required')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setPaying(true)
    try {
      const loaded = await loadRazorpayScript()
      if (!loaded) throw new Error('Could not load payment gateway')

      const orderRes = await fetch('/api/subscriptions/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan, billingPeriod: period, subBusinessOf: businessId }),
      })
      const orderData = await orderRes.json()
      if (!orderData.success) throw new Error(orderData.message || 'Failed to start payment')

      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount * 100,
        currency: orderData.currency,
        order_id: orderData.razorpayOrderId,
        name: 'AN-CRM',
        description: `New SC account — ${plan} plan (${period})`,
        handler: async (response: any) => {
          try {
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
            if (!verifyData.success) throw new Error(verifyData.message || 'Payment verification failed')

            const createRes = await fetch(`/api/businesses/${businessId}/sub-accounts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ ...form, subscriptionId: orderData.subscriptionId }),
            })
            const createData = await createRes.json()
            if (!createData.success) throw new Error(createData.message || 'Failed to create SC account')

            setForm({ name: '', email: '', phone: '', password: '' })
            setShowForm(false)
            mutate()
          } catch (err: any) {
            setError(err.message || 'Something went wrong after payment — contact support with this reference.')
          } finally {
            setPaying(false)
          }
        },
        modal: { ondismiss: () => setPaying(false) },
        theme: { color: '#5B3DF5' },
      })
      rzp.open()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setPaying(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="SC Sub-Accounts"
        description="Add another Service Center account under your business — each addition is a separate paid activation."
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            {showForm ? 'Cancel' : 'Add SC Account'}
          </Button>
        }
      />

      {error && <div className="mb-4 rounded-control border border-danger bg-danger-soft px-4 py-3 text-sm">{error}</div>}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={handleAdd} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="New SC Business Name *">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. City Service Center - Branch 2" />
              </Field>
              <Field label="Owner Login Email *">
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="owner@example.com" />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98765 43210" />
              </Field>
              <Field label="Owner Login Password *">
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Plan">
                <Select value={plan} onChange={(e) => setPlan(e.target.value as PlanKey)}>
                  {PLANS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label="Billing Period">
                <Select value={period} onChange={(e) => setPeriod(e.target.value as BillingPeriod)}>
                  {BILLING_PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </Select>
              </Field>
            </div>

            <div className="text-sm text-ink-2 bg-surface-2 rounded-control px-4 py-3">
              You'll be charged ₹{priceForPeriod(PLANS.find((p) => p.key === plan)!, period).total.toLocaleString('en-IN')} now to activate
              this new SC account — payment happens before the account is created.
            </div>

            <Button type="submit" disabled={paying}>
              {paying ? 'Processing…' : 'Pay & Create SC Account'} <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </form>
        </Card>
      )}

      {isLoading ? (
        <LoadingPanel label="Loading sub-accounts…" />
      ) : subAccounts.length === 0 ? (
        <EmptyState kind="empty" title="No sub-accounts yet" description="Add another SC account above once you're ready to expand." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Business</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Code</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Email</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Phone</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subAccounts.map((b) => (
                  <tr key={b._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-6 py-3 font-medium text-ink flex items-center gap-2"><Building2 className="h-4 w-4 text-accent" />{b.name}</td>
                    <td className="px-6 py-3 tabular text-ink-3">{b.businessCode}</td>
                    <td className="px-6 py-3 text-ink-2">{b.email || '—'}</td>
                    <td className="px-6 py-3 text-ink-2">{b.phone || '—'}</td>
                    <td className="px-6 py-3 text-ink-3">{new Date(b.createdAt).toLocaleDateString('en-IN')}</td>
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
