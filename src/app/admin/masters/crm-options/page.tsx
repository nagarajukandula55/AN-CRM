'use client'

/**
 * Super-admin-only config for the two option lists the New Job Sheet form
 * used to hardcode (Appointment Type: Onsite/Walk-in, Request Type:
 * Repair/Installation) -- per explicit direction, these should be
 * configurable, not baked into the frontend. Bare-bones, same pattern as
 * Fault Codes/Solutions.
 */

import { useState } from 'react'
import useSWR from 'swr'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input } from '@/components/ui/Input'

interface Option {
  _id: string
  code: string
  label: string
  isActive: boolean
}

const LISTS: { type: 'APPOINTMENT_TYPE' | 'REQUEST_TYPE'; title: string; hint: string }[] = [
  { type: 'APPOINTMENT_TYPE', title: 'Appointment Types', hint: 'Populates the Appointment Type dropdown on the New Job Sheet form (Onsite / Walk-in by default).' },
  { type: 'REQUEST_TYPE', title: 'Request (Repair) Types', hint: 'Populates the Request Type dropdown on the New Job Sheet form (Repair / Installation by default).' },
]

function OptionListEditor({ type, title, hint }: { type: string; title: string; hint: string }) {
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: optionsRes, isLoading: loading, mutate: load } = useSWR(
    `/api/crm-option-lists?listType=${type}`
  )
  const items: Option[] = optionsRes?.success ? optionsRes.options ?? [] : []

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch('/api/crm-option-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listType: type, code, label }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to add')
      setCode(''); setLabel('')
      load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function deactivate(id: string) {
    await fetch(`/api/crm-option-lists/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="h-section">{title}</h2>
        <p className="text-xs text-ink-3">{hint}</p>
      </div>

      <Card className="p-4">
        <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
          <Field label="Code">
            <Input required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Label" className="flex-1 min-w-[200px]">
            <Input required value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Button type="submit">Add</Button>
        </form>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-3">
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Label</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-3">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4}><EmptyState kind="empty" title="No options yet" /></td></tr>
            ) : (
              items.map((o) => (
                <tr key={o._id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 tabular text-xs text-ink-2">{o.code}</td>
                  <td className="px-4 py-2 text-ink">{o.label}</td>
                  <td className="px-4 py-2"><Badge tone={o.isActive ? 'success' : 'neutral'}>{o.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="px-4 py-2">
                    {o.isActive && (
                      <button onClick={() => deactivate(o._id)} className="text-xs text-danger hover:underline">Deactivate</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

export default function CrmOptionsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-10 bg-bg min-h-screen">
      <PageHeader title="CRM Job Sheet Options" description="Super Admin only — every business shares these lists." />
      {LISTS.map((l) => (
        <OptionListEditor key={l.type} type={l.type} title={l.title} hint={l.hint} />
      ))}
    </div>
  )
}
