'use client'

/**
 * "Add/remove fields on any form, mark mandatory or optional, choose the
 * input type" -- the super-admin-only management screen for
 * CustomFieldDefinition (per explicit direction: "this should be only
 * for super admin not for vendors"). Mounted at
 * /console/admin/custom-fields; every field defined here is platform-
 * wide, applying to every vendor using that form.
 */

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { Field, Input, Select } from '@/components/ui/Input'

const FORMS: { key: string; label: string }[] = [
  { key: 'JOBSHEET', label: 'Workorder / Job Sheet' },
  { key: 'CUSTOMER', label: 'Customer' },
  { key: 'SALES_INVOICE', label: 'Sales Invoice' },
  { key: 'QUOTATION', label: 'Quotation' },
  { key: 'CREDIT_NOTE', label: 'Credit Note' },
  { key: 'DEBIT_NOTE', label: 'Debit Note' },
  { key: 'PROFORMA_INVOICE', label: 'Proforma Invoice' },
]

const INPUT_TYPES: { key: string; label: string }[] = [
  { key: 'TEXT', label: 'Text' },
  { key: 'TEXTAREA', label: 'Long Text' },
  { key: 'NUMBER', label: 'Number' },
  { key: 'DATE', label: 'Date' },
  { key: 'SELECT', label: 'Dropdown' },
  { key: 'CHECKBOX', label: 'Yes / No' },
]

interface FieldRow {
  _id: string
  fieldKey: string
  label: string
  inputType: string
  options: string[]
  mandatory: boolean
  order: number
}

export default function CustomFieldsManager() {
  const [formKey, setFormKey] = useState('JOBSHEET')
  const { data, isLoading, mutate } = useSWR(`/api/custom-fields?formKey=${formKey}`)
  const fields: FieldRow[] = data?.success ? data.fields : []

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ label: '', inputType: 'TEXT', mandatory: false, options: '' })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.label.trim()) {
      setError('A field name is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formKey,
          label: form.label.trim(),
          inputType: form.inputType,
          mandatory: form.mandatory,
          options: form.inputType === 'SELECT' ? form.options.split(',').map((o) => o.trim()).filter(Boolean) : [],
        }),
      })
      const d = await res.json()
      if (!d.success) {
        setError(d.message || 'Failed to add field')
        return
      }
      setForm({ label: '', inputType: 'TEXT', mandatory: false, options: '' })
      setShowForm(false)
      mutate()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleMandatory(field: FieldRow) {
    await fetch(`/api/custom-fields/${field._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mandatory: !field.mandatory }),
    })
    mutate()
  }

  async function handleDelete(field: FieldRow) {
    await fetch(`/api/custom-fields/${field._id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Custom Fields"
        description="Add or remove extra fields on any form — mark each mandatory or optional, and choose its input type. New fields also show up as columns on the matching list page."
        actions={<Button onClick={() => setShowForm((s) => !s)} icon={<Plus className="h-4 w-4" />}>Add Field</Button>}
      />

      <Card className="p-4">
        <Field label="Form">
          <Select value={formKey} onChange={(e) => { setFormKey(e.target.value); setShowForm(false) }}>
            {FORMS.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </Select>
        </Field>
      </Card>

      {showForm && (
        <Card className="p-5">
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            {error && <div className="lg:col-span-4 rounded-control border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
            <Field label="Field Name" required>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Warranty Card Number" />
            </Field>
            <Field label="Input Type">
              <Select value={form.inputType} onChange={(e) => setForm({ ...form, inputType: e.target.value })}>
                {INPUT_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </Select>
            </Field>
            {form.inputType === 'SELECT' && (
              <Field label="Options (comma-separated)" className="sm:col-span-2 lg:col-span-1">
                <Input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} placeholder="Option A, Option B" />
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm text-ink-2 pb-2.5">
              <input type="checkbox" checked={form.mandatory} onChange={(e) => setForm({ ...form, mandatory: e.target.checked })} className="rounded border-border" />
              Mandatory
            </label>
            <Button type="submit" loading={saving} disabled={saving}>Save Field</Button>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="h-section">{FORMS.find((f) => f.key === formKey)?.label} Fields</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Spinner size={24} /></div>
        ) : fields.length === 0 ? (
          <EmptyState kind="empty" title="No custom fields on this form yet" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3"></th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Field Name</th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Type</th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Mandatory</th>
                <th className="px-5 py-3 text-right text-[10px] uppercase tracking-wider text-ink-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fields.map((f) => (
                <tr key={f._id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-5 py-3 text-ink-3"><GripVertical className="h-4 w-4" /></td>
                  <td className="px-5 py-3 text-sm text-ink font-medium">{f.label}</td>
                  <td className="px-5 py-3 text-sm text-ink-3">{INPUT_TYPES.find((t) => t.key === f.inputType)?.label}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => toggleMandatory(f)}>
                      <Badge tone={f.mandatory ? 'warning' : 'neutral'}>{f.mandatory ? 'Mandatory' : 'Optional'}</Badge>
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleDelete(f)} className="text-ink-3 hover:text-danger" aria-label="Remove field">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
