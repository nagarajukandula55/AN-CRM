'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * Company-issued discount codes -- separate from the vendor referral
 * system (Console has no page for that; a vendor's referral link is
 * self-serve at /vendor/referrals). This is for AN Group's own special
 * offers (festival pricing, partnership deals, goodwill gestures), per
 * explicit direction ("from our company side so if we want to give any
 * special discounts of offers we can always use that").
 */

interface PromoCodeRow {
  _id: string
  code: string
  description?: string
  discountPct: number
  maxRedemptions?: number
  redeemedCount: number
  expiresAt?: string
  isActive: boolean
}

export default function PromoCodesPage() {
  const { data, mutate, isLoading } = useSWR('/api/admin/promo-codes')
  const codes: PromoCodeRow[] = data?.success ? data.codes : []

  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ code: '', description: '', discountPct: 10, maxRedemptions: '', expiresAt: '' })
  const [error, setError] = useState('')

  async function create() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          description: form.description || undefined,
          discountPct: Number(form.discountPct),
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
          expiresAt: form.expiresAt || undefined,
        }),
      })
      const body = await res.json()
      if (!body.success) { setError(body.message || 'Failed to create'); return }
      setForm({ code: '', description: '', discountPct: 10, maxRedemptions: '', expiresAt: '' })
      setCreating(false)
      mutate()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(row: PromoCodeRow) {
    await fetch(`/api/admin/promo-codes/${row._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !row.isActive }),
    })
    mutate()
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6 space-y-6">
      <PageHeader
        title="Promo Codes"
        description="Company-issued discount codes a vendor can enter at checkout — separate from the per-vendor referral system."
        actions={<Button size="sm" onClick={() => setCreating((v) => !v)} icon={<Plus className="w-3.5 h-3.5" />}>New Code</Button>}
      />

      {creating && (
        <Card>
          <CardBody className="space-y-3">
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="block">
                <span className="text-xs text-ink-3 block mb-0.5">Code</span>
                <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="DIWALI25" className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs text-ink-3 block mb-0.5">Discount %</span>
                <input type="number" min={1} max={100} value={form.discountPct} onChange={(e) => setForm((f) => ({ ...f, discountPct: Number(e.target.value) }))} className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs text-ink-3 block mb-0.5">Max redemptions (optional)</span>
                <input type="number" min={1} value={form.maxRedemptions} onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))} className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs text-ink-3 block mb-0.5">Expires (optional)</span>
                <input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-ink-3 block mb-0.5">Description (internal note)</span>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Diwali 2027 offer" className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <Button size="sm" onClick={create} disabled={saving || !form.code.trim()} icon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}>
              Create
            </Button>
          </CardBody>
        </Card>
      )}

      {isLoading ? (
        <LoadingPanel label="Loading promo codes…" />
      ) : codes.length === 0 ? (
        <Card><CardBody>No promo codes yet.</CardBody></Card>
      ) : (
        <Card className="overflow-hidden">
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-ink-3 text-xs eyebrow">
                  <tr>
                    <th className="text-left py-2">Code</th>
                    <th className="text-left py-2">Discount</th>
                    <th className="text-left py-2">Redeemed</th>
                    <th className="text-left py-2">Expires</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c._id} className="border-t border-border">
                      <td className="py-2 tabular font-medium">{c.code}<p className="text-xs text-ink-3 font-normal">{c.description}</p></td>
                      <td className="py-2 tabular">{c.discountPct}%</td>
                      <td className="py-2 tabular text-ink-2">{c.redeemedCount}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}</td>
                      <td className="py-2 text-ink-2">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="py-2"><Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></td>
                      <td className="py-2">
                        <button onClick={() => toggleActive(c)} className="text-xs text-accent hover:underline">
                          {c.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
