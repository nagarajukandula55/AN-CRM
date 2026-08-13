'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Field, Input, Select } from '@/components/ui/Input'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const STATUS_TONE: Record<string, Tone> = {
  TRIAL: 'warning',
  ACTIVE: 'success',
  EXPIRED: 'danger',
  PENDING_PAYMENT: 'info',
  CANCELLED: 'neutral',
}

interface VendorSubscriptionRow {
  _id: string
  status: string
  plan: string
  billingPeriod: string
  trialEndsAt?: string
  expiryDate?: string
  vendor: { _id: string; companyName?: string; email?: string; contactPerson?: string } | null
  business: { _id: string; name?: string } | null
}

interface VendorOption {
  _id: string
  companyName?: string
  email?: string
}

function toDateInputValue(d?: string) {
  if (!d) return ''
  return new Date(d).toISOString().slice(0, 10)
}

/**
 * Admin overview of every vendor's trial/subscription (Subscription docs
 * with subVendorOf set) -- primarily the instant 7-day trials created by
 * services/vendorActivation.service.ts's activateVendorWithTrial when a
 * business has marketplace.skipVendorApproval on (see Business.ts), so an
 * admin can see who's on a trial and manually extend/edit their dates
 * before it expires and src/lib/vendor/checkTrialAccess.ts locks them out.
 */
export default function VendorSubscriptionsPage() {
  const { data, isLoading, mutate } = useSWR('/api/vendor-subscriptions')
  const rows: VendorSubscriptionRow[] = data?.success ? data.subscriptions || [] : []

  const [editing, setEditing] = useState<VendorSubscriptionRow | null>(null)
  const [trialEndsAt, setTrialEndsAt] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newVendorId, setNewVendorId] = useState('')
  const [newStatus, setNewStatus] = useState('TRIAL')
  const [newTrialEndsAt, setNewTrialEndsAt] = useState('')
  const [newExpiryDate, setNewExpiryDate] = useState('')
  const [createSaving, setCreateSaving] = useState(false)
  const { data: vendorsData } = useSWR(creating ? '/api/vendors?businessId=ALL&limit=1000' : null)
  const vendorOptions: VendorOption[] = vendorsData?.success ? vendorsData.vendors || [] : []

  function openEdit(row: VendorSubscriptionRow) {
    setEditing(row)
    setTrialEndsAt(toDateInputValue(row.trialEndsAt))
    setExpiryDate(toDateInputValue(row.expiryDate))
    setStatus(row.status)
  }

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch(`/api/vendor-subscriptions/${editing._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trialEndsAt: trialEndsAt || null,
          expiryDate: expiryDate || null,
          status,
        }),
      })
      const json = await res.json()
      if (json.success) {
        await mutate()
        setEditing(null)
      }
    } finally {
      setSaving(false)
    }
  }

  async function cancelSubscription(row: VendorSubscriptionRow) {
    if (!confirm(`Cancel the subscription for ${row.vendor?.companyName || 'this vendor'}?`)) return
    setCancelling(row._id)
    try {
      const res = await fetch(`/api/vendor-subscriptions/${row._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      const json = await res.json()
      if (json.success) await mutate()
    } finally {
      setCancelling(null)
    }
  }

  function openCreate() {
    setNewVendorId('')
    setNewStatus('TRIAL')
    setNewTrialEndsAt('')
    setNewExpiryDate('')
    setCreating(true)
  }

  async function createSubscription() {
    if (!newVendorId) return
    setCreateSaving(true)
    try {
      const res = await fetch('/api/vendor-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: newVendorId,
          status: newStatus,
          trialEndsAt: newTrialEndsAt || null,
          expiryDate: newExpiryDate || null,
        }),
      })
      const json = await res.json()
      if (json.success) {
        await mutate()
        setCreating(false)
      }
    } finally {
      setCreateSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Vendor Subscriptions"
        description="Trial and paid subscription status for every vendor -- extend or edit trial/expiry dates here."
        actions={<Button onClick={openCreate}>New Subscription</Button>}
      />

      {isLoading ? (
        <LoadingPanel label="Loading vendor subscriptions…" />
      ) : rows.length === 0 ? (
        <EmptyState kind="empty" title="No vendor subscriptions yet" description="Instant-trial vendors will show up here once a business turns on skip-approval onboarding." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-3 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Vendor</th>
                  <th className="text-left px-4 py-3 font-medium">Business</th>
                  <th className="text-left px-4 py-3 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Trial ends</th>
                  <th className="text-left px-4 py-3 font-medium">Expiry</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{row.vendor?.companyName || '—'}</p>
                      <p className="text-ink-3 text-xs">{row.vendor?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{row.business?.name || '—'}</td>
                    <td className="px-4 py-3 text-ink-2 tabular">{row.plan} · {row.billingPeriod}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[row.status] || 'neutral'}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-2 tabular">{row.trialEndsAt ? new Date(row.trialEndsAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-ink-2 tabular">{row.expiryDate ? new Date(row.expiryDate).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(row)}>Edit dates</Button>
                        {row.status !== 'CANCELLED' && (
                          <Button
                            variant="danger"
                            size="sm"
                            loading={cancelling === row._id}
                            onClick={() => cancelSubscription(row)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-md p-6 space-y-4">
            <div>
              <h2 className="h-section">Edit subscription dates</h2>
              <p className="text-sm text-ink-3 mt-1">{editing.vendor?.companyName || 'Vendor'}</p>
            </div>

            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="TRIAL">Trial</option>
                <option value="PENDING_PAYMENT">Pending Payment</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="CANCELLED">Cancelled</option>
              </Select>
            </Field>

            <Field label="Trial ends at">
              <Input type="date" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} />
            </Field>

            <Field label="Expiry date">
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button onClick={save} loading={saving}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-md p-6 space-y-4">
            <div>
              <h2 className="h-section">New vendor subscription</h2>
              <p className="text-sm text-ink-3 mt-1">Create a subscription row for a vendor.</p>
            </div>

            <Field label="Vendor">
              <Select value={newVendorId} onChange={(e) => setNewVendorId(e.target.value)}>
                <option value="">Select vendor…</option>
                {vendorOptions.map((v) => (
                  <option key={v._id} value={v._id}>{v.companyName || v.email || v._id}</option>
                ))}
              </Select>
            </Field>

            <Field label="Status">
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                <option value="TRIAL">Trial</option>
                <option value="PENDING_PAYMENT">Pending Payment</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="CANCELLED">Cancelled</option>
              </Select>
            </Field>

            <Field label="Trial ends at">
              <Input type="date" value={newTrialEndsAt} onChange={(e) => setNewTrialEndsAt(e.target.value)} />
            </Field>

            <Field label="Expiry date">
              <Input type="date" value={newExpiryDate} onChange={(e) => setNewExpiryDate(e.target.value)} />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setCreating(false)} disabled={createSaving}>Cancel</Button>
              <Button onClick={createSubscription} loading={createSaving} disabled={!newVendorId}>Create</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
