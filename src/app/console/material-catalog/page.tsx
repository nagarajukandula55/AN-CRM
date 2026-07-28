'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Plus, X, Package } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * Admin-facing view of the canonical Material/BOM list (models/BOM.ts) --
 * the piece that was missing: only a vendor-scoped page (/vendor/service-
 * bom) existed before. Business-wide staff (Brand/Sales/console, no vendor
 * profile) can now view and create entries here too, per explicit
 * direction ("we have to give the same [BOM] to Sales team also so only
 * BOM is looks valid"). Backed by the same /api/service-center-bom route
 * vendors use -- see that route's business-wide fallback.
 */

interface MaterialEntry {
  _id: string
  partCode: string
  partName: string
  description?: string
  partType: 'SPARE_PART' | 'LABOUR' | 'CONSUMABLE'
  hsnCode: string
  gstRate: number
  rate: number
  isSerialized: boolean
  isActive: boolean
}

const PART_TYPE_LABEL: Record<string, string> = {
  SPARE_PART: 'Spare Part',
  LABOUR: 'Labour',
  CONSUMABLE: 'Consumable',
}

export default function MaterialCatalogPage() {
  const { data, mutate, isLoading } = useSWR('/api/service-center-bom', (url: string) =>
    fetch(url, { credentials: 'include' }).then((r) => r.json())
  )
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    partName: '',
    description: '',
    partType: 'SPARE_PART',
    hsnCode: '',
    gstRate: 18,
    rate: 0,
    isSerialized: false,
  })

  const materials: MaterialEntry[] = data?.success ? data.parts || [] : []

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.partName.trim() || !form.hsnCode.trim()) {
      setError('Material description and HSN code are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/service-center-bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const result = await res.json()
      if (result.success) {
        setForm({ partName: '', description: '', partType: 'SPARE_PART', hsnCode: '', gstRate: 18, rate: 0, isSerialized: false })
        setShowForm(false)
        mutate()
      } else {
        setError(result.error || 'Failed to create material')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Material Catalog"
        description="The standard Material/BOM list — Material Code, Description, Mode, HSN, Rate, Tax% — shared across every operating mode."
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            {showForm ? 'Cancel' : 'Add Material'}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            {error && <div className="text-sm text-danger">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Material Description *">
                <Input value={form.partName} onChange={(e) => setForm({ ...form, partName: e.target.value })} placeholder="e.g. Display Assembly" />
              </Field>
              <Field label="Mode">
                <Select value={form.partType} onChange={(e) => setForm({ ...form, partType: e.target.value })}>
                  <option value="SPARE_PART">Spare Part</option>
                  <option value="LABOUR">Labour</option>
                  <option value="CONSUMABLE">Consumable</option>
                </Select>
              </Field>
              <Field label="HSN Code *">
                <Input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} placeholder="e.g. 8517" />
              </Field>
              <Field label="Tax % (GST)">
                <Input type="number" value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: Number(e.target.value) })} />
              </Field>
              <Field label="Rate (without tax)">
                <Input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} />
              </Field>
              <Field label="Description (optional)">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isSerialized} onChange={(e) => setForm({ ...form, isSerialized: e.target.checked })} />
              Serial-number tracked (SN)
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Material'}
            </Button>
          </form>
        </Card>
      )}

      {isLoading ? (
        <LoadingPanel label="Loading materials…" />
      ) : materials.length === 0 ? (
        <EmptyState kind="empty" title="No materials yet" description="Add your first material or spare part above." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Material Code</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Description</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Mode</th>
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">HSN</th>
                  <th className="text-right px-6 py-3 text-ink-3 font-medium">Rate</th>
                  <th className="text-right px-6 py-3 text-ink-3 font-medium">Tax %</th>
                  <th className="text-center px-6 py-3 text-ink-3 font-medium">SN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {materials.map((m) => (
                  <tr key={m._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-6 py-3 tabular font-medium text-ink">{m.partCode}</td>
                    <td className="px-6 py-3 text-ink-2">{m.partName}</td>
                    <td className="px-6 py-3">
                      <Badge tone="neutral">{PART_TYPE_LABEL[m.partType] || m.partType}</Badge>
                    </td>
                    <td className="px-6 py-3 tabular text-ink-3">{m.hsnCode}</td>
                    <td className="px-6 py-3 text-right tabular text-ink">₹{m.rate?.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-3 text-right tabular text-ink-3">{m.gstRate}%</td>
                    <td className="px-6 py-3 text-center">
                      {m.isSerialized ? <Package className="h-4 w-4 text-accent inline" /> : '—'}
                    </td>
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
