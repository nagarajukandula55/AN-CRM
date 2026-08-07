'use client'

/**
 * SC's Brands & Models -- a plain, vendor-editable free-text list, NOT the
 * shared hierarchical Brand/Series/Model/Variant catalog (that's a
 * different, approval-gated system Brand vendors use). SC never touches
 * that catalog at all -- its workorder intake screen
 * (console/sc/jobsheets) already reads/writes these same two arrays
 * directly (Business.savedBrands / savedModels) via its own inline
 * "Add new brand/model" mini-modal, so whatever a vendor adds here shows
 * up as a suggestion on their very next workorder, and vice versa. This
 * page is just a dedicated place to see the full list and remove entries,
 * for when a quick add/typo-fix from the intake screen itself isn't
 * enough.
 */

import { useState, useEffect } from 'react'
import { Plus, X, Tag, Smartphone } from 'lucide-react'
import { getAuthMe } from '@/lib/authMeCache'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LoadingPanel } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

function SavedListEditor({
  title, icon: Icon, items, onAdd, onRemove, placeholder, saving,
}: {
  title: string
  icon: React.ElementType
  items: string[]
  onAdd: (value: string) => void
  onRemove: (value: string) => void
  placeholder: string
  saving: boolean
}) {
  const [value, setValue] = useState('')
  return (
    <Card>
      <CardBody className="space-y-4">
        <h2 className="h-section flex items-center gap-2"><Icon className="w-4 h-4" /> {title}</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); if (value.trim()) { onAdd(value.trim()); setValue('') } }}
          className="flex gap-2"
        >
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
          <Button type="submit" disabled={saving || !value.trim()} icon={<Plus className="w-4 h-4" />}>Add</Button>
        </form>
        {items.length === 0 ? (
          <EmptyState kind="empty" title={`No ${title.toLowerCase()} added yet`} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface-2 px-3 py-1.5 text-sm text-ink">
                {item}
                <button type="button" onClick={() => onRemove(item)} className="text-ink-3 hover:text-danger transition" title="Remove">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export default function ScBrandsAndModelsPage() {
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [brands, setBrands] = useState<string[]>([])
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAuthMe().then((meData: any) => {
      const user = meData?.user ?? meData
      const id = user?.activeBusinessId || meData?.businesses?.[0]?._id
      setBusinessId(id || null)
      if (id) {
        fetch(`/api/businesses/${id}`).then((r) => r.json()).then((d) => {
          setBrands(d?.business?.savedBrands || [])
          setModels(d?.business?.savedModels || [])
        }).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    }).catch(() => setLoading(false))
  }, [])

  async function save(field: 'savedBrands' | 'savedModels', next: string[]) {
    if (!businessId) return
    setSaving(true)
    try {
      await fetch(`/api/businesses/${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      })
      if (field === 'savedBrands') setBrands(next)
      else setModels(next)
    } finally {
      setSaving(false)
    }
  }

  function addBrand(value: string) {
    if (brands.some((b) => b.toLowerCase() === value.toLowerCase())) return
    save('savedBrands', [...brands, value])
  }
  function removeBrand(value: string) {
    save('savedBrands', brands.filter((b) => b !== value))
  }
  function addModel(value: string) {
    if (models.some((m) => m.toLowerCase() === value.toLowerCase())) return
    save('savedModels', [...models, value])
  }
  function removeModel(value: string) {
    save('savedModels', models.filter((m) => m !== value))
  }

  if (loading) return <div className="min-h-screen bg-bg"><LoadingPanel label="Loading…" /></div>

  return (
    <div className="min-h-screen bg-bg p-6">
      <PageHeader
        eyebrow="Masters"
        title="Brands & Models"
        description="Add the device brands and models you service. These show up as suggestions the next time you open a workorder."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SavedListEditor title="Brands" icon={Tag} items={brands} onAdd={addBrand} onRemove={removeBrand} placeholder="e.g. Samsung" saving={saving} />
        <SavedListEditor title="Models" icon={Smartphone} items={models} onAdd={addModel} onRemove={removeModel} placeholder="e.g. Galaxy M14" saving={saving} />
      </div>
    </div>
  )
}
