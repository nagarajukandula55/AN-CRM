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

interface GRN {
  _id: string
  grnNumber: string
  warehouseId?: { warehouseName?: string }
  totalAcceptedQty: number
  totalValue: number
  status: string
  createdAt: string
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Vendor's own read-only view of Goods Receipts recorded against them (see
// /admin/goods-receipts) -- reuses the exact same /api/goods-receipts
// endpoint, scoped via the vendorId query param (GoodsReceipt already
// carries vendorId natively). Read-only: the business's warehouse team is
// who actually records receipt of goods; a vendor's role is to see what's
// been confirmed received against their purchase orders.
export default function VendorGRNPage() {
  const router = useRouter()

  const { data: profileRes } = useSWR('/api/vendor/profile')
  const ids = profileRes?.success && profileRes.data?._id && profileRes.data?.businessId
    ? { vendorId: profileRes.data._id as string, businessId: profileRes.data.businessId as string }
    : null

  const { data: receiptsRes, error: receiptsFetchError, isLoading: loading } = useSWR(
    ids ? `/api/goods-receipts?businessId=${ids.businessId}&vendorId=${ids.vendorId}&limit=100` : null
  )
  const receipts: GRN[] = receiptsRes?.success === false ? [] : (receiptsRes?.data || [])
  const error: string | null = receiptsFetchError
    ? (receiptsFetchError instanceof Error ? receiptsFetchError.message : 'Could not load goods receipts')
    : (receiptsRes?.success === false ? (receiptsRes.message || 'Failed to load goods receipts') : null)

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Goods Receipts"
          description="What's been confirmed received against your purchase orders"
          actions={<Button variant="secondary" size="sm" onClick={() => router.push('/vendor')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>}
        />

        {error && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>}

        <Card className="overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-ink-3 font-medium">GRN #</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Warehouse</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
                <th className="text-right px-6 py-3 text-ink-3 font-medium">Accepted Qty</th>
                <th className="text-right px-6 py-3 text-ink-3 font-medium">Value</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center"><Spinner className="mx-auto" /></td></tr>
              ) : receipts.length === 0 ? (
                <tr><td colSpan={6}><EmptyState kind="empty" title="No goods receipts found" /></td></tr>
              ) : (
                receipts.map((g) => (
                  <tr key={g._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-6 py-3 tabular text-xs text-ink-3">{g.grnNumber}</td>
                    <td className="px-6 py-3 text-ink-3 text-xs">{g.warehouseId?.warehouseName || '—'}</td>
                    <td className="px-6 py-3 text-center">
                      <Badge tone={STATUS_TONE[g.status] ?? 'neutral'}>{g.status}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right tabular text-ink">{g.totalAcceptedQty}</td>
                    <td className="px-6 py-3 text-right font-medium tabular text-ink">{fmt(g.totalValue)}</td>
                    <td className="px-6 py-3 text-ink-3">{fmtDate(g.createdAt)}</td>
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
