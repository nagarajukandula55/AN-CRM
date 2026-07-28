'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Plus, X, Search, IndianRupee } from 'lucide-react'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

const STAGES = [
  { key: 'NEW', label: 'New', tone: 'info' as const },
  { key: 'QUALIFIED', label: 'Qualified', tone: 'info' as const },
  { key: 'PROPOSAL', label: 'Proposal', tone: 'warning' as const },
  { key: 'NEGOTIATION', label: 'Negotiation', tone: 'warning' as const },
  { key: 'WON', label: 'Won', tone: 'success' as const },
  { key: 'LOST', label: 'Lost', tone: 'danger' as const },
]

interface Deal {
  _id: string
  title: string
  companyName?: string
  value: number
  currency: string
  stage: string
  probability: number
  expectedCloseDate?: string
  customerId?: { _id: string; name: string; phone?: string; email?: string } | null
  createdAt: string
}

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function DealsPage() {
  const { businessId } = useActiveBusinessId()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [dragStage, setDragStage] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '', companyName: '', value: '', probability: '20', expectedCloseDate: '', notes: '',
  })

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const params = (() => {
    const p = new URLSearchParams()
    if (businessId) p.set('businessId', businessId)
    if (debouncedSearch) p.set('search', debouncedSearch)
    return p.toString()
  })()

  const { data, isLoading: loading, mutate } = useSWR(`/api/deals?${params}`, { keepPreviousData: true })
  const deals: Deal[] = data?.success ? data.deals || [] : []

  const totalPipelineValue = deals
    .filter((d) => d.stage !== 'WON' && d.stage !== 'LOST')
    .reduce((sum, d) => sum + (d.value || 0), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Deal title is required'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          title: form.title,
          companyName: form.companyName,
          value: form.value,
          probability: form.probability,
          expectedCloseDate: form.expectedCloseDate || undefined,
          notes: form.notes,
        }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to create deal')
      setShowForm(false)
      setForm({ title: '', companyName: '', value: '', probability: '20', expectedCloseDate: '', notes: '' })
      showToast('Deal created')
      mutate()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function moveStage(dealId: string, stage: string) {
    mutate(
      (prev: any) => prev && {
        ...prev,
        deals: prev.deals.map((d: Deal) => (d._id === dealId ? { ...d, stage } : d)),
      },
      false
    )
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to update stage')
      mutate()
    } catch (err: any) {
      setError(err.message)
      mutate()
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        {toast && (
          <div className="fixed top-6 right-6 z-50 rounded-card border border-border bg-surface px-5 py-3 text-sm text-ink shadow-card-lg">
            {toast}
          </div>
        )}

        <PageHeader
          title="Sales Pipeline"
          description={`${deals.length} deal${deals.length === 1 ? '' : 's'} · ${formatINR(totalPipelineValue)} open pipeline value`}
          actions={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowForm(true)}>New Deal</Button>}
        />

        {error && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>}

        <Card className="p-4 mb-6">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search deals or companies…" className="pl-9" />
          </div>
        </Card>

        {loading ? (
          <LoadingPanel label="Loading pipeline…" />
        ) : deals.length === 0 ? (
          <EmptyState
            kind="empty"
            title="No deals yet"
            description="Create your first deal to start tracking it through the sales pipeline."
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowForm(true)}>New Deal</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {STAGES.map((stage) => {
              const stageDeals = deals.filter((d) => d.stage === stage.key)
              const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
              return (
                <div
                  key={stage.key}
                  onDragOver={(e) => { e.preventDefault(); setDragStage(stage.key) }}
                  onDragLeave={() => setDragStage(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    const dealId = e.dataTransfer.getData('text/deal-id')
                    setDragStage(null)
                    if (dealId) moveStage(dealId, stage.key)
                  }}
                  className={`rounded-card border ${dragStage === stage.key ? 'border-accent' : 'border-border'} bg-surface-2 p-3 min-h-[160px]`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <Badge tone={stage.tone}>{stage.label}</Badge>
                    <span className="text-xs text-ink-3">{stageDeals.length}</span>
                  </div>
                  <p className="text-xs text-ink-3 mb-3 tabular">{formatINR(stageValue)}</p>
                  <div className="space-y-2">
                    {stageDeals.map((d) => (
                      <div
                        key={d._id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/deal-id', d._id)}
                        className="rounded-control border border-border bg-surface p-3 shadow-card cursor-grab active:cursor-grabbing"
                      >
                        <p className="text-sm font-medium text-ink truncate">{d.title}</p>
                        {d.companyName && <p className="text-xs text-ink-3 truncate">{d.companyName}</p>}
                        {d.customerId?.name && <p className="text-xs text-ink-3 truncate">{d.customerId.name}</p>}
                        <p className="text-xs font-medium text-ink-2 mt-1.5 tabular flex items-center gap-0.5">
                          <IndianRupee className="w-3 h-3" />{d.value?.toLocaleString('en-IN')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="relative w-full max-w-md max-h-[90vh] bg-surface border border-border rounded-card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="h-section">New Deal</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-control bg-surface-2 border border-border flex items-center justify-center hover:bg-surface-3">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
              <Field label="Deal title" required>
                <Input required value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              </Field>
              <Field label="Company name">
                <Input value={form.companyName} onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Value (INR)">
                  <Input type="number" min={0} value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} />
                </Field>
                <Field label="Probability (%)">
                  <Input type="number" min={0} max={100} value={form.probability} onChange={(e) => setForm((p) => ({ ...p, probability: e.target.value }))} />
                </Field>
              </div>
              <Field label="Expected close date">
                <Input type="date" value={form.expectedCloseDate} onChange={(e) => setForm((p) => ({ ...p, expectedCloseDate: e.target.value }))} />
              </Field>
              <Field label="Notes">
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </Field>
              {error && <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>}
            </form>
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button className="flex-1" loading={submitting} onClick={handleSubmit}>Create Deal</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
