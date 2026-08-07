'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input } from '@/components/ui/Input'

interface Solution {
  _id: string
  code: string
  description: string
  category?: string
  isActive: boolean
}

export default function SolutionsPage() {
  const { businessId } = useActiveBusinessId();
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: solutionsData, isLoading: loading, mutate: load } = useSWR(
    `/api/solutions${businessId ? `?businessId=${businessId}` : ''}`
  )
  const items: Solution[] = solutionsData?.success ? solutionsData.solutions : []

  async function addSolution(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch('/api/solutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, description, category, businessId, businessScope: 'SINGLE' }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to add')
      setCode(''); setDescription(''); setCategory('')
      load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function deactivate(id: string) {
    await fetch(`/api/solutions/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 bg-bg min-h-screen">
      <PageHeader
        title="Solutions"
        description="Master list of standard repair/resolution descriptions — populates the Solution dropdown when closing out a CRM Workorder, so resolutions are recorded consistently across every technician instead of free-typed each time."
      />

      <Card className="p-4">
        <form onSubmit={addSolution} className="flex flex-wrap gap-2 items-end">
          <Field label="Code">
            <Input required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Description" className="flex-1 min-w-[200px]">
            <Input required value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Category">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
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
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-3">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5}><EmptyState kind="empty" title="No solutions" /></td></tr>
            ) : (
              items.map((s) => (
                <tr key={s._id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 tabular text-xs text-ink-2">{s.code}</td>
                  <td className="px-4 py-2 text-ink">{s.description}</td>
                  <td className="px-4 py-2 text-ink-3">{s.category || '—'}</td>
                  <td className="px-4 py-2"><Badge tone={s.isActive ? 'success' : 'neutral'}>{s.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="px-4 py-2">
                    {s.isActive && (
                      <button onClick={() => deactivate(s._id)} className="text-xs text-danger hover:underline">Deactivate</button>
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
