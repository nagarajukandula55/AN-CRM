'use client'
import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Plus, X, Store, ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { PLANS_BY_MODE, BILLING_PERIODS, priceForPeriod, type PlanKey, type BillingPeriod, type OperatingMode } from '@/core/pricing/plans'

declare global {
  interface Window { Razorpay: any }
}

/**
 * A vendor's own Owner can spin up ANOTHER full vendor account under
 * itself -- a genuinely separate VendorProfile with its own login, not a
 * staff member -- gated on a paid subscription addon charge, same pattern
 * as SC's own sub-accounts (console/sc/sub-accounts) but at the vendor
 * level (VendorProfile.parentVendorId) instead of the business level, so
 * it applies to Brand/POS/SC alike. See api/vendors/[id]/sub-vendors's
 * top comment for the full payment-then-create flow this page drives.
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

interface SubVendor {
  _id: string
  vendorId: string
  companyName: string
  contactPerson?: string
  email?: string
  phone?: string
  isApproved: boolean
  createdAt: string
}

export default function SubVendorsPage() {
  const { businessId } = useActiveBusinessId()
  const [myVendorId, setMyVendorId] = useState<string | null>(null)
  const [operatingMode, setOperatingMode] = useState<OperatingMode | ''>('')
  const [notOwner, setNotOwner] = useState(false)

  useEffect(() => {
    fetch('/api/vendor/type-context').then((r) => r.json()).then((d) => {
      setMyVendorId(d.vendorId || null)
      setNotOwner(d.vendorId ? d.vendorRole !== 'OWNER' : false)
    }).catch(() => {})
  }, [])
  useEffect(() => {
    if (!businessId) return
    fetch(`/api/businesses/${businessId}`).then((r) => r.json()).then((d) => {
      setOperatingMode(d?.business?.operatingMode || '')
    }).catch(() => {})
  }, [businessId])

  const { data, mutate, isLoading } = useSWR(
    myVendorId ? `/api/vendors/${myVendorId}/sub-vendors` : null,
    (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())
  )
  const subVendors: SubVendor[] = data?.success ? data.subVendors || [] : []

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ companyName: '', contactPerson: '', email: '', phone: '', password: '' })
  const [plan, setPlan] = useState<PlanKey>('BASIC')
  const [period, setPeriod] = useState<BillingPeriod>('YEARLY')
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  const PLANS = operatingMode ? PLANS_BY_MODE[operatingMode] : []

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!myVendorId) return
    if (!form.companyName.trim() || !form.contactPerson.trim() || !form.email.trim() || !form.password) {
      setError('Company name, contact person, email and password are required')
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
        body: JSON.stringify({ plan, billingPeriod: period, subVendorOf: myVendorId }),
      })
      const orderData = await orderRes.json()
      if (!orderData.success) throw new Error(orderData.message || 'Failed to start payment')

      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount * 100,
        currency: orderData.currency,
        order_id: orderData.razorpayOrderId,
        name: 'My Biz Flow',
        description: `New sub-vendor — ${plan} plan (${period})`,
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

            const createRes = await fetch(`/api/vendors/${myVendorId}/sub-vendors`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ ...form, subscriptionId: orderData.subscriptionId }),
            })
            const createData = await createRes.json()
            if (!createData.success) throw new Error(createData.message || 'Failed to create sub-vendor')

            setForm({ companyName: '', contactPerson: '', email: '', phone: '', password: '' })
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

  if (notOwner) {
    return (
      <div className="min-h-screen bg-bg text-ink p-6">
        <PageHeader title="Sub-Vendors" description="Only the vendor Owner can add sub-vendors." />
        <EmptyState kind="empty" title="Owner access required" description="Ask your vendor Owner to manage sub-vendors." />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Sub-Vendors"
        description="Add another vendor account under your business — each addition is a separate paid activation, and runs through the same registration flow."
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            {showForm ? 'Cancel' : 'Add Sub-Vendor'}
          </Button>
        }
      />

      {error && <div className="mb-4 rounded-control border border-danger bg-danger-soft px-4 py-3 text-sm">{error}</div>}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={handleAdd} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Company Name *">
                <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="e.g. City Repairs - Branch 2" />
              </Field>
              <Field label="Contact Person *">
                <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="Owner's name" />
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

            {PLANS.length > 0 && (
              <div className="text-sm text-ink-2 bg-surface-2 rounded-control px-4 py-3">
                You'll be charged ₹{priceForPeriod(PLANS.find((p) => p.key === plan) || PLANS[0], period).total.toLocaleString('en-IN')} now to activate
                this sub-vendor — payment happens before the account is created.
              </div>
            )}

            <Button type="submit" disabled={paying || PLANS.length === 0}>
              {paying ? 'Processing…' : 'Pay & Create Sub-Vendor'} <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </form>
        </Card>
      )}

      {isLoading ? (
        <LoadingPanel label="Loading sub-vendors…" />
      ) : subVendors.length === 0 ? (
        <EmptyState kind="empty" title="No sub-vendors yet" description="Add one above once you're ready to expand." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Company</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Vendor ID</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Email</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Phone</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subVendors.map((v) => (
                  <tr key={v._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-6 py-3 font-medium text-ink flex items-center gap-2"><Store className="h-4 w-4 text-accent" />{v.companyName}</td>
                    <td className="px-6 py-3 tabular text-ink-3">{v.vendorId}</td>
                    <td className="px-6 py-3 text-ink-2">{v.email || '—'}</td>
                    <td className="px-6 py-3 text-ink-2">{v.phone || '—'}</td>
                    <td className="px-6 py-3 text-ink-3">{new Date(v.createdAt).toLocaleDateString('en-IN')}</td>
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
