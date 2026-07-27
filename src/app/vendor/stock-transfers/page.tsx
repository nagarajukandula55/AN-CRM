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

interface Transfer {
  _id: string
  transferNumber: string
  fromWarehouse: string
  toWarehouse: string
  status: string
  createdAt: string
}

interface Warehouse {
  _id: string
  warehouseName: string
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  IN_TRANSIT: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Vendor's own view of Stock Transfers touching their own warehouses (see
// /admin/stock-transfers) -- reuses the exact same /api/stock/transfers
// endpoint. StockTransfer has no vendorId of its own (it's warehouse-to-
// warehouse), so this scopes by "either side is one of MY warehouses"
// instead, fed by the same /api/warehouses list the vendor's own
// Warehouses page (/vendor/warehouses) already uses.
export default function VendorStockTransfersPage() {
  const router = useRouter()

  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = meData?.user?.activeBusinessId ?? null

  const { data: whData } = useSWR('/api/warehouses')
  const warehouses: Warehouse[] = whData?.warehouses || whData?.data || []
  const warehouseIds = warehouses.map((w) => w._id)
  const warehouseNames: Record<string, string> = Object.fromEntries(warehouses.map((w) => [w._id, w.warehouseName]))

  const { data: transfersData, isLoading: loading, error: swrError } = useSWR(
    businessId && warehouseIds.length > 0
      ? `/api/stock/transfers?businessId=${businessId}&warehouseIn=${warehouseIds.join(',')}`
      : null
  )
  const transfers: Transfer[] = transfersData?.error ? [] : (transfersData?.transfers || transfersData?.data || [])
  const error = swrError ? 'Could not load stock transfers' : (transfersData?.error ? transfersData.error : null)

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Stock Transfers"
          description="Transfers between your own warehouses"
          actions={<Button variant="secondary" size="sm" onClick={() => router.push('/vendor')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>}
        />

        {error && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>}

        <Card className="overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Transfer #</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">From</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">To</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center"><Spinner className="mx-auto" /></td></tr>
              ) : transfers.length === 0 ? (
                <tr><td colSpan={5}><EmptyState kind="empty" title="No stock transfers found" /></td></tr>
              ) : (
                transfers.map((t) => (
                  <tr key={t._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-6 py-3 tabular text-xs text-ink-3">{t.transferNumber}</td>
                    <td className="px-6 py-3 text-ink-3 text-xs">{warehouseNames[t.fromWarehouse] || t.fromWarehouse}</td>
                    <td className="px-6 py-3 text-ink-3 text-xs">{warehouseNames[t.toWarehouse] || t.toWarehouse}</td>
                    <td className="px-6 py-3 text-center">
                      <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>{t.status.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-6 py-3 text-ink-3">{fmtDate(t.createdAt)}</td>
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
