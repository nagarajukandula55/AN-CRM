'use client'

/**
 * Vendor UI for managing this vendor's BOM parts -- the price
 * list used both for repair-workorder part selection and for GST-correct
 * invoicing (HSN + GST% + unit + part type are all captured on the part
 * itself, not derived/guessed at billing time).
 *
 * Organized as a Brand -> Model -> Part tree, per explicit direction, so a
 * vendor with a large price list can actually browse/manage it instead of
 * scrolling one flat table. A part can sit at any level: brand-less
 * ("Universal"), brand-wide but no specific model ("Any Model" under that
 * brand), or scoped to one exact model.
 */

import { useState, useRef } from 'react'
import useSWR from 'swr'
import { ChevronRight, ChevronDown, Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select } from '@/components/ui/Input'
import { DEFAULT_SPARE_PART_HSN } from '@/core/gst/defaultHsn'

interface UploadRowResult { row: number; status: 'created' | 'error'; partCode?: string; error?: string }
interface UploadSummary { total: number; created: number; failed: number }

interface Brand { _id: string; name: string; logoUrl?: string }
interface DeviceModelOption { _id: string; name: string }
interface Part {
  _id: string
  partName: string
  partCode: string
  description?: string
  partType: 'SPARE_PART' | 'LABOUR' | 'CONSUMABLE'
  unit: string
  hsnCode: string
  gstRate: number
  rate: number
  warrantyDays?: number
  brandId?: { _id: string; name: string } | string
  deviceModelId?: { _id: string; name: string } | string
  isActive: boolean
}

const emptyForm = {
  partName: '', description: '', partType: 'SPARE_PART', unit: 'pcs',
  hsnCode: DEFAULT_SPARE_PART_HSN, gstRate: '18', rate: '', warrantyDays: '', brandId: '', deviceModelId: '',
}

function idOf(ref: any): string {
  return (ref && typeof ref === 'object' ? ref._id : ref) || ''
}
function nameOf(ref: any): string | undefined {
  return ref && typeof ref === 'object' ? ref.name : undefined
}

function PartsTable({ parts, onDeactivate, canManage }: { parts: Part[]; onDeactivate: (id: string) => void; canManage: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-ink-3">
          <th className="px-4 py-2 font-medium">Part Code</th>
          <th className="px-4 py-2 font-medium">Part Name</th>
          <th className="px-4 py-2 font-medium">Type</th>
          <th className="px-4 py-2 font-medium">Unit</th>
          <th className="px-4 py-2 font-medium">HSN</th>
          <th className="px-4 py-2 font-medium">GST%</th>
          <th className="px-4 py-2 font-medium">Rate</th>
          <th className="px-4 py-2 font-medium">Status</th>
          {canManage && <th className="px-4 py-2"></th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {parts.map((p) => (
          <tr key={p._id} className="hover:bg-surface-2 transition-colors">
            <td className="px-4 py-2 tabular text-xs text-ink-2">{p.partCode}</td>
            <td className="px-4 py-2 text-ink">
              {p.partName}
              {p.description && <p className="text-xs text-ink-3">{p.description}</p>}
            </td>
            <td className="px-4 py-2 text-ink-3">{p.partType.replace('_', ' ')}</td>
            <td className="px-4 py-2 text-ink-3">{p.unit}</td>
            <td className="px-4 py-2 text-ink-3">{p.hsnCode}</td>
            <td className="px-4 py-2 text-ink-3">{p.gstRate}%</td>
            <td className="px-4 py-2 tabular text-ink-2">₹{p.rate}</td>
            <td className="px-4 py-2"><Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Active' : 'Inactive'}</Badge></td>
            {canManage && (
              <td className="px-4 py-2">
                {p.isActive && (
                  <button onClick={() => onDeactivate(p._id)} className="text-xs text-danger hover:underline">Deactivate</button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TreeNode({ label, count, children, defaultOpen }: { label: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-surface-2 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-ink-3" /> : <ChevronRight className="w-4 h-4 text-ink-3" />}
        <span className="font-medium text-ink">{label}</span>
        <span className="text-xs text-ink-3">({count})</span>
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </Card>
  )
}

export default function ServiceCenterBOMPage() {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<UploadRowResult[] | null>(null)
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: partsData, isLoading: loading, mutate: refetchParts } = useSWR('/api/service-center-bom')
  const parts: Part[] = partsData?.success ? partsData.parts : []

  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = (meData?.user ?? meData)?.activeBusinessId || null

  const { data: brandsData } = useSWR(businessId ? `/api/brands?businessId=${businessId}` : null)
  const brands: Brand[] = brandsData?.brands || brandsData?.data || []

  // Add/edit is Owner/Manager only, per explicit direction -- everyone
  // else on the vendor's team can view and export but not change the
  // price list. GET /api/service-center-bom is readable by any team
  // member (see resolveVendorForRead), so this page loaded fine for
  // everyone already; the Add Part form just had no role gate of its
  // own, so a non-Owner/Manager saw a fully "working" form that 403'd
  // silently on submit (POST is Owner/Manager-only server-side) -- easy
  // to mistake for "the Brand dropdown doesn't work" when it's actually
  // the whole form being submitted by someone who was never allowed to.
  // /api/vendor/settings is Owner/Manager-only -- same detection pattern
  // vendor/profile page already uses for its Business Settings section.
  // A 403 makes the shared fetcher throw, so `data` stays undefined for
  // non-managers and canManage correctly resolves to false.
  const { data: settingsData } = useSWR('/api/vendor/settings')
  const canManage = !!settingsData?.success

  const { data: formModelsData } = useSWR(
    form.brandId && businessId ? `/api/device-models?businessId=${businessId}&brandId=${form.brandId}` : null
  )
  const formModels: DeviceModelOption[] = formModelsData?.models || []

  function load() {
    refetchParts()
  }

  async function addPart(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/service-center-bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partName: form.partName,
          description: form.description,
          partType: form.partType,
          unit: form.unit,
          hsnCode: form.hsnCode,
          gstRate: parseFloat(form.gstRate) || 0,
          rate: parseFloat(form.rate) || 0,
          warrantyDays: form.warrantyDays ? parseInt(form.warrantyDays) : undefined,
          brandId: form.brandId || undefined,
          deviceModelId: form.deviceModelId || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to add part')
      setForm(emptyForm)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(id: string) {
    await fetch(`/api/service-center-bom/${id}`, { method: 'DELETE' })
    load()
  }

  // Client-side CSV export -- available to everyone (view-only staff
  // still need a way to get this list out, per explicit direction "can
  // view or export but not edit"), no backend endpoint needed for it.
  function exportCsv() {
    const header = ['Part Code', 'Part Name', 'Description', 'Type', 'Brand', 'Model', 'Unit', 'HSN', 'GST%', 'Rate', 'Status']
    const rows = parts.map((p) => [
      p.partCode, p.partName, p.description || '', p.partType, nameOf(p.brandId) || '', nameOf(p.deviceModelId) || '',
      p.unit, p.hsnCode, String(p.gstRate), String(p.rate), p.isActive ? 'Active' : 'Inactive',
    ])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'service-center-bom.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Client-side download of the CSV column headers + example rows a vendor
  // can fill in and hand to Bulk Upload -- same Blob+anchor pattern as
  // exportCsv() above.
  function downloadTemplate() {
    const header = ['partName', 'brandName', 'seriesName', 'modelName', 'partType', 'unit', 'hsnCode', 'gstRate', 'rate', 'warrantyDays', 'description']
    const examples = [
      ['Battery', 'Samsung', 'Galaxy S', 'Galaxy S21', 'SPARE_PART', 'pcs', '85076000', '18', '1200', '180', 'Original battery'],
      ['Screen Guard', 'Samsung', 'Galaxy S', '', 'CONSUMABLE', 'pcs', '39199090', '18', '150', '', 'Fits any Galaxy S model'],
    ]
    const csv = [header, ...examples].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'service-center-bom-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleBulkUpload(file: File) {
    setUploading(true)
    setUploadResults(null)
    setUploadSummary(null)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/service-center-bom/upload', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Bulk upload failed')
      setUploadResults(d.results || [])
      setUploadSummary(d.summary || null)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  // Group parts: Brand -> (Any Model | specific Model) -> parts. No brand
  // at all = "Universal" bucket, shown last.
  const brandGroups = new Map<string, { name: string; parts: Part[] }>()
  const universal: Part[] = []
  for (const p of parts) {
    const bId = idOf(p.brandId)
    if (!bId) { universal.push(p); continue }
    if (!brandGroups.has(bId)) brandGroups.set(bId, { name: nameOf(p.brandId) || 'Unknown Brand', parts: [] })
    brandGroups.get(bId)!.parts.push(p)
  }
  const sortedBrandGroups = Array.from(brandGroups.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="h-page">Service Center BOM</h1>
          <p className="text-sm text-ink-3 mt-1.5">
            Your spare-part / labour / consumable price list, organized Brand → Model → Part — used for workorder line items and GST-correct invoicing.
            {!canManage && ' You can view and export this list; only an Owner or Manager can add or deactivate parts.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={downloadTemplate} icon={<Download className="w-4 h-4" />}>Download Template</Button>
          {canManage && (
            <>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading} loading={uploading} icon={<Upload className="w-4 h-4" />}>
                Bulk Upload
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleBulkUpload(file)
                  e.target.value = ''
                }}
              />
            </>
          )}
          <Button variant="secondary" onClick={exportCsv} disabled={parts.length === 0} icon={<Download className="w-4 h-4" />}>Export CSV</Button>
        </div>
      </div>

      {uploadSummary && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-2">
              Bulk upload: <span className="font-medium text-success">{uploadSummary.created} created</span>
              {uploadSummary.failed > 0 && <span className="text-danger"> · {uploadSummary.failed} failed</span>}
              {' '}of {uploadSummary.total} rows.
            </p>
            <button onClick={() => { setUploadSummary(null); setUploadResults(null) }} className="text-xs text-ink-3 hover:text-ink">Dismiss</button>
          </div>
          {uploadResults && uploadResults.some((r) => r.status === 'error') && (
            <div className="max-h-48 overflow-y-auto border border-border rounded-control">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-2 text-left text-ink-3">
                    <th className="px-3 py-1.5 font-medium">Row</th>
                    <th className="px-3 py-1.5 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {uploadResults.filter((r) => r.status === 'error').map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-1.5 text-ink-2">{r.row}</td>
                      <td className="px-3 py-1.5 text-danger">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {canManage && (
      <Card className="p-4">
        <form onSubmit={addPart} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Part Name" required className="col-span-2">
            <Input required value={form.partName} onChange={e => setForm({ ...form, partName: e.target.value })} placeholder="e.g. Compressor Relay" />
          </Field>
          <Field label="Description (optional, shows on GST invoice)" className="col-span-2">
            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Spec/detail for the invoice line" />
          </Field>
          <Field label="Brand (optional — blank = Universal)">
            <Select value={form.brandId} onChange={e => setForm({ ...form, brandId: e.target.value, deviceModelId: '' })}>
              <option value="">Universal / Any Brand</option>
              {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Model (optional — blank = Any Model)">
            <Select value={form.deviceModelId} onChange={e => setForm({ ...form, deviceModelId: e.target.value })} disabled={!form.brandId}>
              <option value="">{form.brandId ? 'Any Model' : 'Select a brand first'}</option>
              {formModels.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={form.partType} onChange={e => setForm({ ...form, partType: e.target.value })}>
              <option value="SPARE_PART">Spare Part</option>
              <option value="LABOUR">Labour</option>
              <option value="CONSUMABLE">Consumable</option>
            </Select>
          </Field>
          <Field label="Unit">
            <Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pcs" />
          </Field>
          <Field label="Warranty (days) (optional)">
            <Input type="number" value={form.warrantyDays} onChange={e => setForm({ ...form, warrantyDays: e.target.value })} />
          </Field>
          <Field label="HSN Code" required>
            <Input required value={form.hsnCode} onChange={e => setForm({ ...form, hsnCode: e.target.value })} />
          </Field>
          <Field label="GST %" required>
            <Input required type="number" step="0.01" value={form.gstRate} onChange={e => setForm({ ...form, gstRate: e.target.value })} />
          </Field>
          <Field label="Rate (excl. tax)" required>
            <Input required type="number" step="0.01" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} />
          </Field>
          <div className="col-span-2 md:col-span-4 flex justify-end">
            <Button disabled={saving} loading={saving}>Add Part</Button>
          </div>
        </form>
      </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-ink-3 text-center py-6">Loading…</p>
        ) : parts.length === 0 ? (
          <EmptyState kind="empty" title="No parts yet" />
        ) : (
          <>
            {sortedBrandGroups.map(([brandId, group]) => {
              const anyModelParts = group.parts.filter((p) => !idOf(p.deviceModelId))
              const modelGroups = new Map<string, { name: string; parts: Part[] }>()
              for (const p of group.parts) {
                const mId = idOf(p.deviceModelId)
                if (!mId) continue
                if (!modelGroups.has(mId)) modelGroups.set(mId, { name: nameOf(p.deviceModelId) || 'Unknown Model', parts: [] })
                modelGroups.get(mId)!.parts.push(p)
              }
              const sortedModelGroups = Array.from(modelGroups.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name))
              return (
                <TreeNode key={brandId} label={group.name} count={group.parts.length}>
                  <div className="p-2 space-y-2 bg-surface-2">
                    {anyModelParts.length > 0 && (
                      <TreeNode label="Any Model" count={anyModelParts.length}>
                        <PartsTable parts={anyModelParts} onDeactivate={deactivate} canManage={canManage} />
                      </TreeNode>
                    )}
                    {sortedModelGroups.map(([modelId, mg]) => (
                      <TreeNode key={modelId} label={mg.name} count={mg.parts.length}>
                        <PartsTable parts={mg.parts} onDeactivate={deactivate} canManage={canManage} />
                      </TreeNode>
                    ))}
                  </div>
                </TreeNode>
              )
            })}
            {universal.length > 0 && (
              <TreeNode label="Universal / No Brand" count={universal.length} defaultOpen={sortedBrandGroups.length === 0}>
                <PartsTable parts={universal} onDeactivate={deactivate} canManage={canManage} />
              </TreeNode>
            )}
          </>
        )}
      </div>
    </div>
  )
}
