'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  Package,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Input, Select } from '@/components/ui/Input'

interface Product {
  _id: string
  name: string
  sku?: string
  description?: string
  category?: string
  basePrice?: number
  taxRate?: number
  unit?: string
  hsn?: string
  reorderLevel?: number
  quantity?: number
  status?: string
  images?: string[]
  slug?: string
  metaTitle?: string
  metaDescription?: string
  keywords?: string[]
  isActive?: boolean
  businessId?: string | { _id: string; name?: string; brandName?: string; legalName?: string }
}

function businessLabel(businessId: Product['businessId']): string {
  if (!businessId) return '—'
  if (typeof businessId === 'string') return businessId
  return businessId.brandName || businessId.legalName || businessId.name || businessId._id
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
function getStatusInfo(p: Product): { label: string; tone: Tone } {
  const qty = p.quantity ?? 0
  const reorder = p.reorderLevel ?? 0
  if (p.status === 'INACTIVE') return { label: 'Inactive', tone: 'neutral' }
  if (qty === 0) return { label: 'Out of Stock', tone: 'danger' }
  if (qty <= reorder) return { label: 'Low Stock', tone: 'warning' }
  return { label: 'Active', tone: 'success' }
}

// NOTE: This page is a READ-ONLY browse/list view over NativeProduct — the
// same model the Native storefront reads from (see models/NativeProduct.ts
// and api/storefront/products/route.ts). It previously also had its own
// parallel "Add Product" / "Edit Product" modal that wrote directly to
// NativeProduct via a plain comma-separated image-URL text field and free
// text category, completely bypassing the rich vendor-product-wizard
// (Cloudinary upload, real category dropdown, BOM cost engine, SEO,
// compliance, GST/HSN lookup, approval workflow). Per explicit product
// direction ("make 1 single product upload source, nothing else"), that
// modal has been removed entirely. The ONLY way to create or edit a
// product — for a vendor or a super admin — is the wizard at
// /vendor/products/new (which already resolves the correct businessId).
// This list remains for browsing/searching the live catalog.
export default function ProductsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  // Super Admin defaults to seeing every business's products, not just
  // whichever one happens to be their currently-active business — per
  // explicit direction that the platform team needs full-catalog control.
  const [viewAllBusinesses, setViewAllBusinesses] = useState(true)

  const { data: meData, error: meErr } = useSWR('/api/auth/me')
  const businessId: string | null = meData?.user?.activeBusinessId || null
  const isSuperAdmin = !!meData?.user?.isSuperAdmin

  // /api/products is the real Product catalog endpoint (with SEO fields,
  // HSN, slug, etc.) — the Inventory Items endpoint used previously is a
  // different data model entirely and always 400'd here since it
  // requires a businessId this page never sent.
  const productsQs = !meData
    ? null
    : isSuperAdmin
    ? (viewAllBusinesses ? 'allBusinesses=true' : `businessId=${businessId}`)
    : (businessId ? `businessId=${businessId}` : null)

  const { data: productsRaw, isLoading: productsLoading, error: productsErr } = useSWR(
    productsQs ? `/api/products?${productsQs}` : null,
    (url: string) =>
      fetch(url, { headers: businessId ? { 'x-active-business-id': businessId } : {} }).then((r) => {
        if (!r.ok) throw new Error('Failed to load products')
        return r.json()
      })
  )
  const products: Product[] = productsRaw
    ? (Array.isArray(productsRaw) ? productsRaw : (productsRaw.products ?? [])).map((p: any) => ({
        ...p,
        quantity: p.stock ?? p.quantity ?? 0,
        status: p.isActive === false ? 'INACTIVE' : 'ACTIVE',
      }))
    : []

  const error: string | null = meErr
    ? 'Failed to connect'
    : meData && !isSuperAdmin && !businessId
    ? 'No active business selected'
    : productsErr
    ? 'Failed to load products'
    : null

  const loading = !meData || (!!productsQs && productsLoading)

  // Real ProductCategory tree (parentId chains), fetched separately from
  // the flat category strings stored on Product itself -- lets the filter
  // list reflect actual parent/child branching (e.g. "Mobiles" with
  // "Smartphones"/"Feature Phones" nested under it) instead of just an
  // alphabetical list of whatever strings happen to appear on products.
  const catBusinessId: string | null = businessId || meData?.businesses?.[0]?._id || null
  const { data: categoryRes } = useSWR(catBusinessId ? `/api/product-categories?businessId=${catBusinessId}` : null)
  const categoryTree: { id: string; name: string; depth: number }[] = (() => {
    const raw: any[] = categoryRes?.categories || categoryRes?.data || []
    if (raw.length === 0) return []
    const byParent = new Map<string, any[]>()
    for (const c of raw) {
      const pid = c.parentId?._id || c.parentId || 'root'
      if (!byParent.has(pid)) byParent.set(pid, [])
      byParent.get(pid)!.push(c)
    }
    const flat: { id: string; name: string; depth: number }[] = []
    const walk = (parentKey: string, depth: number) => {
      for (const c of byParent.get(parentKey) || []) {
        flat.push({ id: c._id, name: c.name, depth })
        walk(c._id, depth + 1)
      }
    }
    walk('root', 0)
    return flat
  })()

  function toggleAllBusinesses() {
    setViewAllBusinesses((v) => !v)
  }

  // Tree-ordered when the real category hierarchy loaded successfully
  // (parent immediately followed by its children, indented); falls back to
  // the flat alphabetical list derived from products if it didn't, or for
  // any legacy free-text category value that isn't in the tree at all.
  const productCategoryNames = Array.from(new Set(products.map((p) => p.category ?? '').filter(Boolean)))
  const treeNames = new Set(categoryTree.map((c) => c.name))
  const orphanCategories = productCategoryNames.filter((c) => !treeNames.has(c))
  const categoryOptions: { label: string; depth: number }[] =
    categoryTree.length > 0
      ? [...categoryTree.map((c) => ({ label: c.name, depth: c.depth })), ...orphanCategories.map((c) => ({ label: c, depth: 0 }))]
      : productCategoryNames.map((c) => ({ label: c, depth: 0 }))

  const filtered = products.filter((p) => {
    const matchSearch =
      !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'ALL' || p.category === categoryFilter
    return matchSearch && matchCat
  })

  const total = products.length
  const active = products.filter((p) => p.status !== 'INACTIVE' && (p.quantity ?? 0) > 0).length
  const inactive = products.filter((p) => p.status === 'INACTIVE').length
  const lowStock = products.filter((p) => {
    const qty = p.quantity ?? 0
    const reorder = p.reorderLevel ?? 0
    return qty > 0 && qty <= reorder
  }).length

  if (loading && products.length === 0) {
    return <LoadingPanel label="Loading products…" />
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Products"
          description={isSuperAdmin && viewAllBusinesses ? 'Product catalog across every business' : 'Product catalog — browse the live catalog'}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => router.push('/admin')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
              {isSuperAdmin && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push('/admin/vendor-products/pending')}
                    title="Products submitted by vendors awaiting Super Admin approval"
                    className="!bg-warning-soft !text-warning !border-warning/20"
                  >
                    Pending Approvals
                  </Button>
                  <Button variant={viewAllBusinesses ? 'primary' : 'secondary'} size="sm" onClick={toggleAllBusinesses}>
                    {viewAllBusinesses ? 'All Businesses' : 'My Business Only'}
                  </Button>
                </>
              )}
              <Button
                onClick={() => router.push(businessId ? `/vendor/products/new?businessId=${businessId}` : '/vendor/products/new')}
                title="Products are created through the vendor product wizard — the single product upload source"
                icon={<Plus className="w-4 h-4" />}
              >
                Add Product
              </Button>
            </>
          }
        />

        {error && (
          <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Package, label: 'Total Products', value: String(total) },
            { icon: CheckCircle, label: 'Active', value: String(active) },
            { icon: XCircle, label: 'Inactive', value: String(inactive) },
            { icon: AlertTriangle, label: 'Low Stock', value: String(lowStock) },
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

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
            <Input
              type="text"
              placeholder="Search products, SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="min-w-[220px]">
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {categoryOptions.map((c) => (
                <option key={c.label} value={c.label}>
                  {'  '.repeat(c.depth)}{c.depth > 0 ? '↳ ' : ''}{c.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Name</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">SKU</th>
                {isSuperAdmin && viewAllBusinesses && (
                  <th className="text-left px-6 py-3 text-ink-3 font-medium">Business</th>
                )}
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Category</th>
                <th className="text-right px-6 py-3 text-ink-3 font-medium">Base Price</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Tax %</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Unit</th>
                <th className="text-right px-6 py-3 text-ink-3 font-medium">Stock</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin && viewAllBusinesses ? 9 : 8}>
                    <EmptyState kind="empty" title="No products found" />
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const { label, tone } = getStatusInfo(p)
                  return (
                    <tr
                      key={p._id}
                      onClick={() => router.push(`/admin/products/${p._id}`)}
                      className="hover:bg-surface-2 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-3 font-medium text-ink">{p.name}</td>
                      <td className="px-6 py-3 text-ink-3 tabular text-xs">{p.sku ?? '—'}</td>
                      {isSuperAdmin && viewAllBusinesses && (
                        <td className="px-6 py-3 text-ink-3">{businessLabel(p.businessId)}</td>
                      )}
                      <td className="px-6 py-3 text-ink-3">{p.category ?? '—'}</td>
                      <td className="px-6 py-3 text-right tabular text-ink">{p.basePrice != null ? fmt(p.basePrice) : '—'}</td>
                      <td className="px-6 py-3 text-center text-ink-3">{p.taxRate != null ? `${p.taxRate}%` : '—'}</td>
                      <td className="px-6 py-3 text-ink-3">{p.unit ?? '—'}</td>
                      <td className="px-6 py-3 text-right tabular text-ink">{p.quantity ?? 0}</td>
                      <td className="px-6 py-3 text-center">
                        <Badge tone={tone}>{label}</Badge>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
