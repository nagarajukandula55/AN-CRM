'use client'

/**
 * SC's Brands & Models -- a plain, vendor-editable list, NOT the shared
 * hierarchical Brand/Series/Model/Variant catalog (that's a different,
 * approval-gated system Brand vendors use). SC never touches that catalog
 * at all -- its workorder intake screen (console/sc/jobsheets) already
 * reads/writes these same fields directly (Business.savedBrands /
 * savedModelsByBrand) via its own inline "Add new brand/model" mini-modal,
 * so whatever a vendor adds here shows up as a suggestion on their very
 * next workorder, and vice versa. A model always belongs to a brand --
 * savedModelsByBrand is keyed by brand name, not a flat model list with no
 * relationship to any brand.
 */

import { useState, useEffect } from 'react'
import { Plus, X, Tag, Smartphone, ChevronDown } from 'lucide-react'
import { getAuthMe } from '@/lib/authMeCache'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { LoadingPanel } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

export default function ScBrandsAndModelsPage({ useVendorScope = false }: { useVendorScope?: boolean }) {
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [brands, setBrands] = useState<string[]>([])
  const [modelsByBrand, setModelsByBrand] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [newBrand, setNewBrand] = useState('')
  const [modelBrand, setModelBrand] = useState('')
  const [newModel, setNewModel] = useState('')
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null)

  // A vendor Owner can't read/write the shared platform Business record
  // directly (api/businesses/[id] correctly 403s them) -- /api/vendor/
  // saved-catalog is the vendor-scoped equivalent for exactly these two
  // fields, same one the shared jobsheet form already uses.
  const catalogEndpoint = useVendorScope ? '/api/vendor/saved-catalog' : null

  useEffect(() => {
    if (useVendorScope) {
      fetch('/api/vendor/saved-catalog').then((r) => r.json()).then((d) => {
        const b: string[] = d?.savedBrands || []
        setBrands(b)
        setModelsByBrand(d?.savedModelsByBrand || {})
        if (b.length > 0) { setModelBrand(b[0]); setExpandedBrand(b[0]) }
      }).finally(() => setLoading(false))
      return
    }
    getAuthMe().then((meData: any) => {
      const user = meData?.user ?? meData
      const id = user?.activeBusinessId || meData?.businesses?.[0]?._id
      setBusinessId(id || null)
      if (id) {
        fetch(`/api/businesses/${id}`).then((r) => r.json()).then((d) => {
          const b: string[] = d?.business?.savedBrands || []
          setBrands(b)
          setModelsByBrand(d?.business?.savedModelsByBrand || {})
          if (b.length > 0) { setModelBrand(b[0]); setExpandedBrand(b[0]) }
        }).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    }).catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function persist(nextBrands: string[], nextModelsByBrand: Record<string, string[]>) {
    const endpoint = catalogEndpoint || (businessId ? `/api/businesses/${businessId}` : null)
    if (!endpoint) return
    setSaving(true)
    try {
      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savedBrands: nextBrands, savedModelsByBrand: nextModelsByBrand }),
      })
      setBrands(nextBrands)
      setModelsByBrand(nextModelsByBrand)
    } finally {
      setSaving(false)
    }
  }

  function addBrand() {
    const value = newBrand.trim()
    if (!value || brands.some((b) => b.toLowerCase() === value.toLowerCase())) return
    const next = [...brands, value]
    persist(next, modelsByBrand)
    setNewBrand('')
    setModelBrand(value)
    setExpandedBrand(value)
  }
  function removeBrand(brand: string) {
    const nextBrands = brands.filter((b) => b !== brand)
    const nextModels = { ...modelsByBrand }
    delete nextModels[brand]
    persist(nextBrands, nextModels)
    if (modelBrand === brand) setModelBrand(nextBrands[0] || '')
    if (expandedBrand === brand) setExpandedBrand(null)
  }
  function addModel() {
    const brand = modelBrand.trim()
    const model = newModel.trim()
    if (!brand || !model) return
    const currentModels = modelsByBrand[brand] || []
    if (currentModels.some((m) => m.toLowerCase() === model.toLowerCase())) return
    const nextBrands = brands.some((b) => b.toLowerCase() === brand.toLowerCase()) ? brands : [...brands, brand]
    const nextModels = { ...modelsByBrand, [brand]: [...currentModels, model] }
    persist(nextBrands, nextModels)
    setNewModel('')
    setExpandedBrand(brand)
  }
  function removeModel(brand: string, model: string) {
    const nextModels = { ...modelsByBrand, [brand]: (modelsByBrand[brand] || []).filter((m) => m !== model) }
    persist(brands, nextModels)
  }

  if (loading) return <div className="min-h-screen bg-bg"><LoadingPanel label="Loading…" /></div>

  return (
    <div className="min-h-screen bg-bg p-6">
      <PageHeader
        eyebrow="Masters"
        title="Brands & Models"
        description="Add the device brands and models you service — every model belongs to a brand. These show up as suggestions the next time you open a workorder."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardBody className="space-y-4">
            <h2 className="h-section flex items-center gap-2"><Tag className="w-4 h-4" /> Add a Brand</h2>
            <form onSubmit={(e) => { e.preventDefault(); addBrand() }} className="flex gap-2">
              <Input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="e.g. Samsung" />
              <Button type="submit" disabled={saving || !newBrand.trim()} icon={<Plus className="w-4 h-4" />}>Add</Button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-4">
            <h2 className="h-section flex items-center gap-2"><Smartphone className="w-4 h-4" /> Add a Model</h2>
            {brands.length === 0 ? (
              <p className="text-sm text-ink-3">Add a brand first.</p>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); addModel() }} className="flex gap-2">
                <Select value={modelBrand} onChange={(e) => setModelBrand(e.target.value)} className="max-w-[160px]">
                  {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </Select>
                <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="e.g. Galaxy M14" />
                <Button type="submit" disabled={saving || !newModel.trim()} icon={<Plus className="w-4 h-4" />}>Add</Button>
              </form>
            )}
          </CardBody>
        </Card>
      </div>

      {brands.length === 0 ? (
        <EmptyState kind="empty" title="No brands added yet" />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {brands.map((brand) => {
              const models = modelsByBrand[brand] || []
              const isOpen = expandedBrand === brand
              return (
                <div key={brand}>
                  <button
                    type="button"
                    onClick={() => setExpandedBrand(isOpen ? null : brand)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-2 transition text-left"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown className={`w-4 h-4 text-ink-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      <span className="font-medium text-ink">{brand}</span>
                      <span className="text-xs text-ink-3">({models.length} model{models.length === 1 ? '' : 's'})</span>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); removeBrand(brand) }}
                      className="text-xs text-ink-3 hover:text-danger transition"
                    >
                      Remove brand
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 flex flex-wrap gap-2">
                      {models.length === 0 ? (
                        <p className="text-xs text-ink-3">No models added for {brand} yet.</p>
                      ) : (
                        models.map((model) => (
                          <span key={model} className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface-2 px-3 py-1.5 text-sm text-ink">
                            {model}
                            <button type="button" onClick={() => removeModel(brand, model)} className="text-ink-3 hover:text-danger transition" title="Remove">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
