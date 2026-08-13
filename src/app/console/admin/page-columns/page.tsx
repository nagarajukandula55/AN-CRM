'use client'

import { useEffect, useState } from 'react'
import { ArrowUp, ArrowDown, Save } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'
import { LoadingPanel } from '@/components/ui/Spinner'

interface ColumnRow {
  key: string
  defaultLabel: string
  label: string
  visible: boolean
  order: number
}

// Every page wired to useColumnConfig() so far, plus their real hardcoded
// current columns -- shown in the picker even before a config has ever been
// saved for them (the admin GET-all route only returns pages that already
// have a saved override).
const KNOWN_PAGES: Record<string, ColumnRow[]> = {
  jobsheets: [
    { key: 'jobSheetNumber', defaultLabel: 'Job Sheet #', label: 'Job Sheet #', visible: true, order: 0 },
    { key: 'customerName', defaultLabel: 'Customer', label: 'Customer', visible: true, order: 1 },
    { key: 'phone', defaultLabel: 'Phone', label: 'Phone', visible: true, order: 2 },
    { key: 'title', defaultLabel: 'Title', label: 'Title', visible: true, order: 3 },
    { key: 'status', defaultLabel: 'Status', label: 'Status', visible: true, order: 4 },
    { key: 'tat', defaultLabel: 'TAT', label: 'TAT', visible: true, order: 5 },
    { key: 'createdAt', defaultLabel: 'Created', label: 'Created', visible: true, order: 6 },
    { key: 'actions', defaultLabel: 'Actions', label: 'Actions', visible: true, order: 7 },
  ],
  customers: [
    { key: 'name', defaultLabel: 'Name', label: 'Name', visible: true, order: 0 },
    { key: 'contact', defaultLabel: 'Contact', label: 'Contact', visible: true, order: 1 },
    { key: 'gstin', defaultLabel: 'GSTIN', label: 'GSTIN', visible: true, order: 2 },
    { key: 'location', defaultLabel: 'Location', label: 'Location', visible: true, order: 3 },
    { key: 'imeiOrSerial', defaultLabel: 'IMEI/Serial', label: 'IMEI/Serial', visible: true, order: 4 },
    { key: 'source', defaultLabel: 'Source', label: 'Source', visible: true, order: 5 },
    { key: 'date', defaultLabel: 'Date', label: 'Date', visible: true, order: 6 },
  ],
  inventory: [
    { key: 'name', defaultLabel: 'Name', label: 'Name', visible: true, order: 0 },
    { key: 'sku', defaultLabel: 'SKU', label: 'SKU', visible: true, order: 1 },
    { key: 'category', defaultLabel: 'Category', label: 'Category', visible: true, order: 2 },
    { key: 'quantity', defaultLabel: 'Qty', label: 'Qty', visible: true, order: 3 },
    { key: 'unit', defaultLabel: 'Unit', label: 'Unit', visible: true, order: 4 },
    { key: 'reorderLevel', defaultLabel: 'Reorder', label: 'Reorder', visible: true, order: 5 },
    { key: 'status', defaultLabel: 'Status', label: 'Status', visible: true, order: 6 },
  ],
  // SC dashboard's two stat-card rows (console/sc/dashboard) -- same
  // rename/hide/reorder config, just cards instead of table columns.
  // "Add" isn't offered for cards any more than it is for columns: each
  // key maps to a real computed value in the dashboard, there's no
  // arbitrary-card mechanism -- rename/hide/reorder existing cards only.
  'sc-dashboard-cards-period': [
    { key: 'workordersToday', defaultLabel: 'Workorders Today', label: 'Workorders Today', visible: true, order: 0 },
    { key: 'workordersWeek', defaultLabel: 'Workorders This Week', label: 'Workorders This Week', visible: true, order: 1 },
    { key: 'workordersMonth', defaultLabel: 'Workorders This Month', label: 'Workorders This Month', visible: true, order: 2 },
    { key: 'workordersYear', defaultLabel: 'Workorders This Year', label: 'Workorders This Year', visible: true, order: 3 },
  ],
  'sc-dashboard-cards-summary': [
    { key: 'openWorkorders', defaultLabel: 'Open Workorders', label: 'Open Workorders', visible: true, order: 0 },
    { key: 'overdueWorkorders', defaultLabel: 'Overdue (7d+)', label: 'Overdue (7d+)', visible: true, order: 1 },
    { key: 'closedThisMonth', defaultLabel: 'Closed This Month', label: 'Closed This Month', visible: true, order: 2 },
  ],
}

export default function PageColumnsAdminPage() {
  const [pageKeys, setPageKeys] = useState<string[]>(Object.keys(KNOWN_PAGES))
  const [selectedKey, setSelectedKey] = useState<string>('jobsheets')
  const [rows, setRows] = useState<ColumnRow[]>(KNOWN_PAGES.jobsheets)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Populate the picker with every registered pageKey (from saved configs)
  // plus the hardcoded known pages, so pages show up even before ever being
  // saved once.
  useEffect(() => {
    fetch('/api/admin/page-column-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const fromServer: string[] = Array.isArray(d?.configs) ? d.configs.map((c: any) => c.pageKey) : []
        setPageKeys(Array.from(new Set([...Object.keys(KNOWN_PAGES), ...fromServer])).sort())
      })
      .catch(() => {})
  }, [])

  // Load the selected page's saved config (if any), merged over its known
  // defaults so newly-added default columns still show up.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const defaults = KNOWN_PAGES[selectedKey] ?? []
    fetch(`/api/admin/page-column-config/${selectedKey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        const saved: ColumnRow[] | undefined = d?.config?.columns
        if (Array.isArray(saved) && saved.length > 0) {
          const savedMap = new Map(saved.map((c) => [c.key, c]))
          const merged = defaults.map((def, i) => {
            const ov = savedMap.get(def.key)
            return ov
              ? { key: def.key, defaultLabel: def.defaultLabel, label: ov.label ?? def.defaultLabel, visible: ov.visible !== false, order: ov.order ?? i }
              : { ...def, order: i }
          })
          setRows(merged.sort((a, b) => a.order - b.order))
        } else {
          setRows(defaults)
        }
      })
      .catch(() => setRows(defaults))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedKey])

  function updateRow(idx: number, patch: Partial<ColumnRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function moveRow(idx: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next.map((r, i) => ({ ...r, order: i }))
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const columns = rows.map((r, i) => ({ ...r, order: i }))
      const res = await fetch(`/api/admin/page-column-config/${selectedKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to save')
      showToast('Column config saved')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      {toast && (
        <div className="fixed top-6 right-6 z-50 rounded-card border border-border bg-surface px-5 py-3 text-sm text-ink shadow-card-lg">
          {toast}
        </div>
      )}

      <PageHeader
        title="Page Columns & Cards"
        description="Control which columns and dashboard cards vendor pages show, their order, and their label text."
        actions={<Button onClick={handleSave} disabled={saving || loading} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>}
      />

      <Card className="mb-6">
        <CardBody>
          <Field label="Page" className="max-w-xs">
            <Select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
              {pageKeys.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {error && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>}

      {loading ? (
        <LoadingPanel label="Loading columns…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-3 text-xs eyebrow">
                <tr>
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Key</th>
                  <th className="text-left px-4 py-3">Label</th>
                  <th className="text-left px-4 py-3">Visible</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          className="p-1 rounded-control hover:bg-surface-3 text-ink-2 disabled:opacity-30"
                          disabled={idx === 0}
                          onClick={() => moveRow(idx, -1)}
                          title="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1 rounded-control hover:bg-surface-3 text-ink-2 disabled:opacity-30"
                          disabled={idx === rows.length - 1}
                          onClick={() => moveRow(idx, 1)}
                          title="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular text-ink-2">{row.key}</td>
                    <td className="px-4 py-3">
                      <Input
                        value={row.label}
                        onChange={(e) => updateRow(idx, { label: e.target.value })}
                        className="max-w-xs"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={row.visible}
                        onChange={(e) => updateRow(idx, { visible: e.target.checked })}
                        className="w-4 h-4"
                      />
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
