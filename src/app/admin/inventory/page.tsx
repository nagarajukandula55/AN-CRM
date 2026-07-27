'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Package,
  AlertTriangle,
  XCircle,
  DollarSign,
  Search,
  ArrowRight,
  ArrowUpDown,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Field, Input } from '@/components/ui/Input'

interface InventoryItem {
  _id: string
  name: string
  sku?: string
  category?: string
  quantity: number
  unit?: string
  reorderLevel?: number
  basePrice?: number
  status?: string
  // Needed to post stock movements against the real /api/inventory/movements
  // contract, which requires materialId + warehouseId (not just an item id).
  materialId?: string
  warehouseId?: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
function getStockStatus(item: InventoryItem): { label: string; tone: Tone } {
  const qty = item.quantity ?? 0
  const reorder = item.reorderLevel ?? 0
  if (qty === 0) return { label: 'Out of Stock', tone: 'danger' }
  if (qty <= reorder) return { label: 'Low Stock', tone: 'warning' }
  return { label: 'In Stock', tone: 'success' }
}

export default function InventoryPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')

  // --- Stock adjustment state -------------------------------------------
  // This whole feature (adjust modal + POST to /api/inventory/movements)
  // used to live only in the orphaned src/app/inventory/page.tsx, a
  // duplicate of this page that was never linked from the sidebar. Rather
  // than leave that functionality stranded in dead code, it's consolidated
  // here into the live page so stock can actually be adjusted from the UI
  // that people can reach. The businessId it needs is resolved the same
  // way the rest of this page already does (via /api/auth/me), not via
  // localStorage like the orphaned version did.
  const [adjustModal, setAdjustModal] = useState<InventoryItem | null>(null)
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)
  const [adjustError, setAdjustError] = useState<string | null>(null)

  // Resolve the active business the same way every other admin page does
  // (vendors/products/finance) instead of a localStorage key ('an_user')
  // that is never actually written anywhere in the app — that dead lookup
  // meant businessId was always omitted here, and since /api/inventory/items
  // requires it, this page could never load data.
  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = meData?.user?.activeBusinessId ?? null

  const { data: itemsRes, isLoading: loading, mutate: fetchItems } = useSWR(
    businessId ? ['/api/inventory/items', businessId] as const : null,
    ([url, bId]: readonly [string, string]) =>
      fetch(`${url}?businessId=${bId}`, { headers: { 'x-active-business-id': bId } }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error('Failed to load inventory'))
      )
  )
  // /api/inventory/items responds with { success, data }, not { items }
  const items: InventoryItem[] = itemsRes
    ? Array.isArray(itemsRes)
      ? itemsRes
      : itemsRes.data ?? itemsRes.items ?? []
    : []
  const error: string | null = meData && !businessId ? 'No active business selected' : null

  // Posts a stock movement (IN/OUT) for the item currently open in the
  // adjust modal, then refreshes the list so the new quantity is reflected.
  // /api/inventory/movements requires materialId + warehouseId + type +
  // quantity — the orphaned page only ever sent an itemId, which that
  // route doesn't even accept, so this now uses the real contract.
  async function adjustStock() {
    if (!adjustModal) return
    if (!adjustModal.materialId || !adjustModal.warehouseId) {
      setAdjustError('This item is missing material/warehouse info and cannot be adjusted')
      return
    }
    if (!businessId) {
      setAdjustError('No active business selected')
      return
    }

    setAdjustSaving(true)
    setAdjustError(null)
    try {
      const res = await fetch('/api/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-active-business-id': businessId },
        body: JSON.stringify({
          materialId: adjustModal.materialId,
          warehouseId: adjustModal.warehouseId,
          type: adjustQty >= 0 ? 'IN' : 'OUT',
          quantity: Math.abs(adjustQty),
          notes: adjustNote,
          businessId,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setAdjustModal(null)
        setAdjustQty(0)
        setAdjustNote('')
        await fetchItems()
      } else {
        setAdjustError(data.error || 'Failed to adjust stock')
      }
    } catch {
      setAdjustError('Failed to connect')
    } finally {
      setAdjustSaving(false)
    }
  }

  const categories =['ALL', ...Array.from(new Set(items.map((i) => i.category ?? 'Uncategorized').filter(Boolean)))]

  const filtered = items.filter((item) => {
    const matchSearch =
      !search ||
      item.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.sku?.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'ALL' || (item.category ?? 'Uncategorized') === categoryFilter
    return matchSearch && matchCat
  })

  const totalItems = items.length
  const lowStock = items.filter((i) => {
    const qty = i.quantity ?? 0
    const reorder = i.reorderLevel ?? 0
    return qty > 0 && qty <= reorder
  }).length
  const outOfStock = items.filter((i) => (i.quantity ?? 0) === 0).length
  const totalValue = items.reduce((s, i) => s + (i.quantity ?? 0) * (i.basePrice ?? 0), 0)

  if (loading && items.length === 0) {
    return <LoadingPanel label="Loading inventory…" />
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Inventory"
          description="Stock levels and item management"
          actions={<Button variant="secondary" size="sm" onClick={() => router.push('/admin')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>}
        />

        {error && (
          <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Package, label: 'Total Items', value: String(totalItems) },
            { icon: AlertTriangle, label: 'Low Stock', value: String(lowStock) },
            { icon: XCircle, label: 'Out of Stock', value: String(outOfStock) },
            { icon: DollarSign, label: 'Total Value', value: fmt(totalValue) },
          ].map(({ icon: Icon, label, value }) => (
            <Card key={label} className="p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-ink-3 text-sm">{label}</span>
                <div className="w-8 h-8 rounded-control bg-accent-soft flex items-center justify-center">
                  <Icon className="w-4 h-4 text-accent" />
                </div>
              </div>
              <p className="tabular text-2xl font-semibold text-ink">{value}</p>
            </Card>
          ))}
        </div>

        {/* Quick Links */}
        <div className="flex gap-3 mb-6">
          <Link href="/admin/inventory/lots">
            <Button variant="secondary" size="sm">Lot Management <ArrowRight className="w-3.5 h-3.5" /></Button>
          </Link>
          <Link href="/admin/stock-adjustments">
            <Button variant="secondary" size="sm">Stock Adjustments <ArrowRight className="w-3.5 h-3.5" /></Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
            <Input
              type="text"
              placeholder="Search items, SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {categories.slice(0, 6).map((cat) => (
              <Button key={cat} variant={categoryFilter === cat ? 'primary' : 'secondary'} size="sm" onClick={() => setCategoryFilter(cat)}>
                {cat}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card className="overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Name</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">SKU</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Category</th>
                <th className="text-right px-6 py-3 text-ink-3 font-medium">Qty</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Unit</th>
                <th className="text-right px-6 py-3 text-ink-3 font-medium">Reorder</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><EmptyState kind="empty" title="No items found" /></td></tr>
              ) : (
                filtered.map((item) => {
                  const { label, tone } = getStockStatus(item)
                  return (
                    <tr key={item._id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-6 py-3 font-medium text-ink">{item.name}</td>
                      <td className="px-6 py-3 text-ink-3 tabular text-xs">{item.sku ?? '—'}</td>
                      <td className="px-6 py-3 text-ink-3">{item.category ?? '—'}</td>
                      <td className="px-6 py-3 text-right tabular text-ink">
                        <button
                          onClick={() => {
                            setAdjustModal(item)
                            setAdjustQty(0)
                            setAdjustNote('')
                            setAdjustError(null)
                          }}
                          className="flex items-center gap-1.5 justify-end w-full hover:text-accent transition-colors"
                          title="Adjust stock"
                        >
                          {item.quantity ?? 0}
                          <ArrowUpDown className="w-3 h-3 text-ink-3" />
                        </button>
                      </td>
                      <td className="px-6 py-3 text-ink-3">{item.unit ?? '—'}</td>
                      <td className="px-6 py-3 text-right tabular text-ink-3">{item.reorderLevel ?? 0}</td>
                      <td className="px-6 py-3 text-center">
                        <Badge tone={tone}>{label}</Badge>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Stock adjustment modal — this is the UI half of the movement-posting
          feature merged in from the orphaned src/app/inventory/page.tsx. The
          state (adjustModal/adjustQty/adjustNote) and the adjustStock() POST
          to /api/inventory/movements already existed above; without this
          modal there was no way to actually open/submit an adjustment, so
          clicking the quantity in the table did nothing. */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 space-y-4">
            <h2 className="h-section flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4" /> Adjust Stock
            </h2>
            <p className="text-sm text-ink-3">
              {adjustModal.name} · Current:{' '}
              <strong className="text-ink tabular">
                {adjustModal.quantity} {adjustModal.unit ?? ''}
              </strong>
            </p>

            {adjustError && (
              <div className="text-xs text-danger bg-danger-soft border border-danger/20 rounded-control px-3 py-2">
                {adjustError}
              </div>
            )}

            <Field label="Adjustment (+/-)" hint={`New total: ${Math.max(0, (adjustModal.quantity ?? 0) + adjustQty)} ${adjustModal.unit ?? ''}`}>
              <Input
                type="number"
                value={adjustQty}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdjustQty(parseFloat(e.target.value) || 0)}
                onFocus={(e) => e.target.select()}
                placeholder="+50 to add, -10 to remove"
              />
            </Field>

            <Field label="Reason / Note">
              <Input
                value={adjustNote}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdjustNote(e.target.value)}
                placeholder="Purchase, damage, return..."
              />
            </Field>

            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => setAdjustModal(null)} disabled={adjustSaving} className="flex-1">
                Cancel
              </Button>
              <Button onClick={adjustStock} disabled={adjustQty === 0 || adjustSaving} loading={adjustSaving} className="flex-1">
                {adjustSaving ? 'Saving...' : 'Apply'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
