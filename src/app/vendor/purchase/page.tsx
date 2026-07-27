'use client'

import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'

interface PO {
  _id: string
  poNumber: string
  status: string
  totalAmount: number
  expectedDate?: string
  createdAt: string
  warehouseId?: { warehouseName?: string } | string
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  APPROVED: 'success',
  REJECTED: 'danger',
  REVISION_REQUIRED: 'warning',
  CANCELLED: 'neutral',
  RECEIVED: 'info',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Vendor's own read-only view of Purchase Orders placed WITH them by the
// business (see /admin/purchase-orders) -- reuses the exact same
// /api/purchase-orders endpoint, scoped to just this vendor's own orders
// via the vendorId query param (PurchaseOrder already carries vendorId
// natively, unlike CrmCall/CrmJobSheet -- no assignedTo-set workaround
// needed here). Read-only: the business is the one who creates/approves
// these, a vendor's role here is to see and fulfill them, not author them.
export default function VendorPurchasePage() {
  const router = useRouter()

  const { data: profileRes } = useSWR('/api/vendor/profile')
  const vendorId: string | null = profileRes?.success && profileRes.data?._id ? profileRes.data._id : null

  const { data: ordersRes, isLoading: loading, error: swrError } = useSWR(
    vendorId ? `/api/purchase-orders?vendorId=${vendorId}` : null
  )
  const orders: PO[] = ordersRes?.success !== false ? ordersRes?.data || [] : []
  const error = swrError ? 'Could not load purchase orders' : (ordersRes?.success === false ? (ordersRes.message || 'Failed to load purchase orders') : null)

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Purchase Orders"
          description="Orders placed with you by the business"
          actions={<Button variant="secondary" size="sm" onClick={() => router.push('/vendor')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>}
        />

        {error && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>}

        <Card className="overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-ink-3 font-medium">PO #</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Warehouse</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
                <th className="text-right px-6 py-3 text-ink-3 font-medium">Amount</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Expected</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center"><Spinner className="mx-auto" /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={6}><EmptyState kind="empty" title="No purchase orders found" /></td></tr>
              ) : (
                orders.map((po) => (
                  <tr key={po._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-6 py-3 tabular text-xs text-ink-3">{po.poNumber}</td>
                    <td className="px-6 py-3 text-ink-3 text-xs">
                      {typeof po.warehouseId === 'object' ? po.warehouseId?.warehouseName : '—'}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <Badge tone={STATUS_TONE[po.status] ?? 'neutral'}>{po.status.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right font-medium tabular text-ink">{fmt(po.totalAmount)}</td>
                    <td className="px-6 py-3 text-ink-3">{fmtDate(po.expectedDate)}</td>
                    <td className="px-6 py-3 text-ink-3">{fmtDate(po.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
