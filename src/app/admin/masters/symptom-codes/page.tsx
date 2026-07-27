'use client'

/**
 * Bare-bones admin CRUD for SymptomCode master data -- same pattern as
 * /admin/masters/fault-codes, separate list per explicit direction
 * ("make one more list as Symptom code list and add that to repair flow
 * page").
 */

import { useState } from 'react'
import useSWR from 'swr'
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";
import BusinessScopeControl, { type BusinessScopeValue } from "@/components/catalog/BusinessScopeControl";
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from "@/core/catalog/deviceCategory";
import { GroupedCodeTree } from "@/components/shared/GroupedCodeTree";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select } from '@/components/ui/Input'

interface SymptomCode {
  _id: string
  code: string
  description: string
  category?: string
  deviceCategory?: DeviceCategory | null
  parentId?: string | null
  isActive: boolean
}

export default function SymptomCodesPage() {
  const { businessId } = useActiveBusinessId();
  const [view, setView] = useState<'table' | 'tree'>('tree')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [deviceCategory, setDeviceCategory] = useState<DeviceCategory | ''>('')
  const [parentId, setParentId] = useState('')
  const [scope, setScope] = useState<BusinessScopeValue>({ businessScope: 'SINGLE', businessIds: [] })
  const [error, setError] = useState<string | null>(null)

  const { data: symptomCodesData, isLoading: loading, mutate: load } = useSWR(
    `/api/symptom-codes${businessId ? `?businessId=${businessId}` : ''}`
  )
  const items: SymptomCode[] = symptomCodesData?.success ? symptomCodesData.symptomCodes : []

  async function addCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch('/api/symptom-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, description, category, deviceCategory: deviceCategory || null, businessId, parentId: parentId || null, ...scope }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to add')
      setCode(''); setDescription(''); setCategory(''); setDeviceCategory(''); setParentId(''); setScope({ businessScope: 'SINGLE', businessIds: [] })
      load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function deactivate(id: string) {
    await fetch(`/api/symptom-codes/${id}`, { method: 'DELETE' })
    load()
  }

  async function editItem(item: SymptomCode) {
    const newDescription = prompt('Edit description', item.description)
    if (newDescription === null || !newDescription.trim()) return
    await fetch(`/api/symptom-codes/${item._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: newDescription.trim() }),
    })
    load()
  }

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6 bg-bg min-h-screen">
      <PageHeader
        title="Symptom Codes"
        description="Master list of observed symptoms — separate from Fault Codes, used in the repair flow on the workorder detail page to record what was observed distinct from the diagnosed fault."
      />

      <Card className="p-4">
        <form onSubmit={addCode} className="flex flex-wrap gap-2 items-end">
          <Field label="Code">
            <Input required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Description" className="flex-1 min-w-[200px]">
            <Input required value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Device Type">
            <Select value={deviceCategory} onChange={(e) => setDeviceCategory(e.target.value as DeviceCategory | '')}>
              <option value="">Uncategorized</option>
              {DEVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{DEVICE_CATEGORY_LABELS[c]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Component Category">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Screen, Battery" />
          </Field>
          <Field label="Parent (optional)">
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— Top level —</option>
              {items.map((f) => (
                <option key={f._id} value={f._id}>{f.parentId ? `↳ ${f.code}` : f.code} — {f.description}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Add</Button>
        </form>
      </Card>

      <Card className="p-4 max-w-sm">
        <BusinessScopeControl value={scope} onChange={setScope} />
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-1 bg-surface-2 rounded-control p-1 w-fit">
        <Button variant={view === 'table' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('table')}>Table</Button>
        <Button variant={view === 'tree' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('tree')}>Tree</Button>
      </div>

      {!loading && items.length > 0 && view === 'tree' && (
        <GroupedCodeTree
          items={items.map((f) => ({ ...f, name: `${f.code} — ${f.description}` }))}
          onEdit={(item) => editItem(items.find((f) => f._id === item._id)!)}
          onDelete={(item) => deactivate(item._id)}
        />
      )}

      {view === 'table' && (
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-3">
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Device Type</th>
              <th className="px-4 py-2 font-medium">Component</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-3">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6}><EmptyState kind="empty" title="No symptom codes" /></td></tr>
            ) : (
              items.map((f) => (
                <tr key={f._id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 tabular text-xs text-ink-2">{f.code}</td>
                  <td className="px-4 py-2 text-ink">{f.description}</td>
                  <td className="px-4 py-2 text-ink-3">{f.deviceCategory ? DEVICE_CATEGORY_LABELS[f.deviceCategory] : '—'}</td>
                  <td className="px-4 py-2 text-ink-3">{f.category || '—'}</td>
                  <td className="px-4 py-2"><Badge tone={f.isActive ? 'success' : 'neutral'}>{f.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="px-4 py-2">
                    {f.isActive && (
                      <button onClick={() => deactivate(f._id)} className="text-xs text-danger hover:underline">Deactivate</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      )}
    </div>
  )
}
