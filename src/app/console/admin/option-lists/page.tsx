'use client'

/**
 * Super-admin master-data editor for CrmOptionList -- the generic
 * code/label option-list model backing several job-sheet <select> fields
 * (Appointment Type, Request Type, Warranty Status, Device Appearance).
 * One generic page for every listType, since the model itself is already
 * generic -- add/edit/reorder/deactivate rows via the existing
 * /api/crm-option-lists CRUD routes (super-admin-only writes, enforced
 * server-side). Global rows only (businessId: null) -- this page manages
 * the platform-wide defaults every vendor sees; per-business overrides
 * aren't exposed here.
 */

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Field, Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

type ListType = 'APPOINTMENT_TYPE' | 'REQUEST_TYPE' | 'WARRANTY_STATUS' | 'DEVICE_APPEARANCE'

const LIST_TYPES: { key: ListType; label: string }[] = [
  { key: 'APPOINTMENT_TYPE', label: 'Appointment Type' },
  { key: 'REQUEST_TYPE', label: 'Request Type' },
  { key: 'WARRANTY_STATUS', label: 'Warranty Status' },
  { key: 'DEVICE_APPEARANCE', label: 'Device Appearance' },
]

interface Option {
  _id: string
  code: string
  label: string
  sortOrder: number
  isActive: boolean
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function OptionListsAdminPage() {
  const [listType, setListType] = useState<ListType>('APPOINTMENT_TYPE')
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; option?: Option } | null>(null)
  const [form, setForm] = useState({ code: '', label: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Option | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { data, isLoading, mutate } = useSWR(`/api/crm-option-lists?listType=${listType}&all=true`, fetcher)
  const options: Option[] = (data?.options || []).slice().sort((a: Option, b: Option) => a.sortOrder - b.sortOrder)

  function openCreate() {
    setForm({ code: '', label: '' })
    setError(null)
    setModal({ mode: 'create' })
  }

  function openEdit(o: Option) {
    setForm({ code: o.code, label: o.label })
    setError(null)
    setModal({ mode: 'edit', option: o })
  }

  async function handleSave() {
    if (!form.code.trim() || !form.label.trim()) {
      setError('Code and label are both required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (modal?.mode === 'create') {
        const res = await fetch('/api/crm-option-lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listType,
            code: form.code.trim(),
            label: form.label.trim(),
            sortOrder: options.length,
          }),
        })
        const d = await res.json()
        if (!res.ok || !d.success) throw new Error(d.error || 'Failed to create option')
      } else if (modal?.option) {
        const res = await fetch(`/api/crm-option-lists/${modal.option._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: form.code.trim(), label: form.label.trim() }),
        })
        const d = await res.json()
        if (!res.ok || !d.success) throw new Error(d.error || 'Failed to update option')
      }
      setModal(null)
      mutate()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(o: Option) {
    await fetch(`/api/crm-option-lists/${o._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !o.isActive }),
    })
    mutate()
  }

  async function moveOption(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= options.length) return
    const a = options[idx]
    const b = options[target]
    await Promise.all([
      fetch(`/api/crm-option-lists/${a._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: b.sortOrder }),
      }),
      fetch(`/api/crm-option-lists/${b._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: a.sortOrder }),
      }),
    ])
    mutate()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/crm-option-lists/${deleteTarget._id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to delete option')
      setDeleteTarget(null)
      mutate()
    } catch (err: any) {
      setError(err.message || 'Failed to delete option')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Option Lists"
        description="Manage the global dropdown options used across job sheets — Appointment Type, Request Type, Warranty Status, Device Appearance."
        actions={<Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>Add Option</Button>}
      />

      <div className="flex flex-wrap gap-2 mb-6">
        {LIST_TYPES.map((lt) => (
          <button
            key={lt.key}
            onClick={() => setListType(lt.key)}
            className={`px-4 py-2 rounded-control text-sm font-medium border transition ${
              listType === lt.key
                ? 'bg-accent text-white border-accent'
                : 'bg-surface text-ink-2 border-border hover:bg-surface-2'
            }`}
          >
            {lt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingPanel label="Loading options…" />
      ) : options.length === 0 ? (
        <EmptyState kind="empty" title="No options yet" description="Add the first option for this list." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-3 text-xs eyebrow">
                <tr>
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Code</th>
                  <th className="text-left px-4 py-3">Label</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {options.map((o, idx) => (
                  <tr key={o._id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          className="p-1 rounded-control hover:bg-surface-3 text-ink-2 disabled:opacity-30"
                          disabled={idx === 0}
                          onClick={() => moveOption(idx, -1)}
                          title="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1 rounded-control hover:bg-surface-3 text-ink-2 disabled:opacity-30"
                          disabled={idx === options.length - 1}
                          onClick={() => moveOption(idx, 1)}
                          title="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular text-ink-2">{o.code}</td>
                    <td className="px-4 py-3 text-ink">{o.label}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(o)}>
                        <Badge tone={o.isActive ? 'success' : 'neutral'}>{o.isActive ? 'Active' : 'Inactive'}</Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="p-1.5 rounded-control hover:bg-surface-3 text-ink-2"
                          onClick={() => openEdit(o)}
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1.5 rounded-control hover:bg-surface-3 text-danger"
                          onClick={() => setDeleteTarget(o)}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-sm p-6 space-y-4">
            <h2 className="h-section">{modal.mode === 'create' ? 'Add Option' : 'Edit Option'}</h2>
            {error && (
              <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-3 py-2">{error}</div>
            )}
            <Field label="Code">
              <Input
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. ONSITE"
              />
            </Field>
            <Field label="Label">
              <Input
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Onsite"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button onClick={handleSave} loading={saving} disabled={saving}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-sm p-6 space-y-4">
            <h2 className="h-section">Delete Option</h2>
            <p className="text-sm text-ink-2">
              Delete “{deleteTarget.label}” ({deleteTarget.code})? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete} loading={deleting} disabled={deleting}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
