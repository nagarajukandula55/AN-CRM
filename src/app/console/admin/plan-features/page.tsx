'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Save, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * Super-Admin-only matrix: which modules/features each plan tier
 * (mode x BASIC/PRO/ULTIMATE) unlocks, editable at runtime instead of
 * requiring a redeploy of core/pricing/plans.ts -- per explicit direction
 * ("Ensure these options i mean all the features i need UI to tag to the
 * plan so only that plan subscribers can avail the info"). Backed by
 * /api/admin/plan-features; a checkbox toggle here writes a
 * PlanFeatureConfig override, checked ahead of every module's static
 * default in api/ui/sidebar/route.ts.
 */

interface PlanRow {
  mode: string
  plan: string
  name: string
  moduleKeys: string[]
  // What a paying vendor's VendorSubscription.modules gets populated with
  // (api/vendor/billing/subscribe) -- the vocabulary that actually gates
  // the vendor portal's own nav, distinct from moduleKeys above (console
  // sidebar only).
  vendorModuleKeys: string[]
  monthlyPriceINR: number
  seatLimit: string
  freeTrialDays: number
  isOverridden: boolean
}

interface PricingDraft {
  monthlyPriceINR?: number
  seatLimit?: string
  freeTrialDays?: number
}

export default function PlanFeaturesPage() {
  const { data, mutate, isLoading } = useSWR('/api/admin/plan-features', (url: string) =>
    fetch(url, { credentials: 'include' }).then((r) => r.json())
  )
  const [saving, setSaving] = useState<string | null>(null)
  const [pending, setPending] = useState<Record<string, string[]>>({})
  const [vendorPending, setVendorPending] = useState<Record<string, string[]>>({})
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, PricingDraft>>({})

  const plans: PlanRow[] = data?.success ? data.plans : []
  const catalog: { key: string; label: string }[] = data?.success ? data.catalog : []
  const vendorCatalog: { key: string; label: string }[] = data?.success ? data.vendorCatalog : []
  const modesOrder: string[] = data?.success ? data.modesOrder : []

  function rowKey(p: { mode: string; plan: string }) {
    return `${p.mode}:${p.plan}`
  }

  function currentKeys(row: PlanRow): string[] {
    return pending[rowKey(row)] ?? row.moduleKeys
  }

  function toggle(row: PlanRow, featureKey: string) {
    const key = rowKey(row)
    const keys = new Set(currentKeys(row))
    if (keys.has(featureKey)) keys.delete(featureKey)
    else keys.add(featureKey)
    setPending((p) => ({ ...p, [key]: Array.from(keys) }))
  }

  function currentVendorKeys(row: PlanRow): string[] {
    return vendorPending[rowKey(row)] ?? row.vendorModuleKeys
  }

  function toggleVendor(row: PlanRow, featureKey: string) {
    const key = rowKey(row)
    const keys = new Set(currentVendorKeys(row))
    if (keys.has(featureKey)) keys.delete(featureKey)
    else keys.add(featureKey)
    setVendorPending((p) => ({ ...p, [key]: Array.from(keys) }))
  }

  function currentPricing(row: PlanRow): Required<PricingDraft> {
    const draft = pricingDrafts[rowKey(row)]
    return {
      monthlyPriceINR: draft?.monthlyPriceINR ?? row.monthlyPriceINR,
      seatLimit: draft?.seatLimit ?? row.seatLimit,
      freeTrialDays: draft?.freeTrialDays ?? row.freeTrialDays,
    }
  }

  function setPricing(row: PlanRow, patch: PricingDraft) {
    const key = rowKey(row)
    setPricingDrafts((d) => ({ ...d, [key]: { ...currentPricing(row), ...d[key], ...patch } }))
  }

  async function save(row: PlanRow) {
    const key = rowKey(row)
    setSaving(key)
    try {
      const pricing = currentPricing(row)
      await fetch('/api/admin/plan-features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: row.mode, plan: row.plan, moduleKeys: currentKeys(row), vendorModuleKeys: currentVendorKeys(row), ...pricing }),
      })
      setPending((p) => { const n = { ...p }; delete n[key]; return n })
      setVendorPending((p) => { const n = { ...p }; delete n[key]; return n })
      setPricingDrafts((p) => { const n = { ...p }; delete n[key]; return n })
      mutate()
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Plan Features"
        description="Which modules and features each plan tier unlocks — only subscribers on a tier that includes a feature can see or use it."
      />

      {isLoading ? (
        <LoadingPanel label="Loading plans…" />
      ) : (
        <div className="space-y-8">
          {modesOrder.map((mode) => (
            <div key={mode}>
              <div className="eyebrow mb-3">{mode}</div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {plans.filter((p) => p.mode === mode).map((row) => {
                  const keys = new Set(currentKeys(row))
                  const vendorKeys = new Set(currentVendorKeys(row))
                  const pricing = currentPricing(row)
                  const dirty = !!pending[rowKey(row)] || !!vendorPending[rowKey(row)] || !!pricingDrafts[rowKey(row)]
                  return (
                    <Card key={rowKey(row)}>
                      <CardBody>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink">{row.name}</span>
                            {row.isOverridden && <Badge tone="info">Customized</Badge>}
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => save(row)} disabled={!dirty || saving === rowKey(row)} icon={saving === rowKey(row) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}>
                            Save
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <label className="block">
                            <span className="text-xs text-ink-3 block mb-0.5">Price / mo (₹)</span>
                            <input
                              type="number"
                              min={0}
                              value={pricing.monthlyPriceINR}
                              onChange={(e) => setPricing(row, { monthlyPriceINR: Number(e.target.value) })}
                              onFocus={(e) => e.target.select()}
                              className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs text-ink-3 block mb-0.5">Seat limit</span>
                            <input
                              type="text"
                              value={pricing.seatLimit}
                              onChange={(e) => setPricing(row, { seatLimit: e.target.value })}
                              className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs text-ink-3 block mb-0.5">Trial days</span>
                            <input
                              type="number"
                              min={0}
                              value={pricing.freeTrialDays}
                              onChange={(e) => setPricing(row, { freeTrialDays: Number(e.target.value) })}
                              onFocus={(e) => e.target.select()}
                              className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm"
                            />
                          </label>
                        </div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 mb-1">Console (admin sidebar)</p>
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 mb-3">
                          {catalog.map((f) => (
                            <label key={f.key} className="flex items-center gap-2 text-sm text-ink-2">
                              <input type="checkbox" checked={keys.has(f.key)} onChange={() => toggle(row, f.key)} />
                              {f.label}
                            </label>
                          ))}
                        </div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 mb-1">Vendor Portal (what a paying vendor actually gets)</p>
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {vendorCatalog.map((f) => (
                            <label key={f.key} className="flex items-center gap-2 text-sm text-ink-2">
                              <input type="checkbox" checked={vendorKeys.has(f.key)} onChange={() => toggleVendor(row, f.key)} />
                              {f.label}
                            </label>
                          ))}
                        </div>
                      </CardBody>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
