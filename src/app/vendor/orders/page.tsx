'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import {
  AlertCircle,
  ChevronRight,
  Package,
} from 'lucide-react'
import ExportCsvButton from '@/components/shared/ExportCsvButton'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

interface Order {
  _id: string
  orderNumber: string
  createdAt: string
  totalAmount: number
  status: string
  items: Array<{ name: string; quantity: number; price: number }>
}

interface OrdersResponse {
  success: boolean
  orders: Order[]
  total: number
  page: number
  totalPages: number
}

const STATUS_TABS = ['All', 'Pending', 'Processing', 'Delivered', 'Cancelled']

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  PENDING: 'warning',
  PROCESSING: 'info',
  SHIPPED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'danger',
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function VendorOrdersPage() {
  const [activeTab, setActiveTab] = useState('All')
  const [page, setPage] = useState(1)

  const status = activeTab === 'All' ? '' : activeTab.toUpperCase()
  const params = new URLSearchParams({
    page: String(page),
    limit: '10',
    ...(status && { status }),
  })
  const { data, isLoading: loading, error: swrError } = useSWR<OrdersResponse>(
    `/api/vendor/orders?${params}`,
    { keepPreviousData: true }
  )
  const orders: Order[] = data?.success ? data.orders : []
  const total = data?.success ? data.total : 0
  const totalPages = data?.success ? data.totalPages : 1
  const error = swrError || (data && !data.success) ? 'Failed to load orders' : ''

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vendor Portal"
        title="My Orders"
        description={`${total} order${total !== 1 ? 's' : ''} total`}
        actions={
          <ExportCsvButton
            filename="vendor-orders"
            rows={orders}
            columns={[
              { header: 'Order #', value: (r: Order) => r.orderNumber },
              { header: 'Date', value: (r: Order) => formatDate(r.createdAt) },
              { header: 'Amount', value: (r: Order) => r.totalAmount },
              { header: 'Status', value: (r: Order) => r.status },
              { header: 'Items', value: (r: Order) => (r.items || []).map((i) => `${i.name} x${i.quantity}`).join('; ') },
            ]}
          />
        }
      />

      {/* Tab Filter */}
      <div className="flex gap-1 p-1 rounded-control bg-surface border border-border w-fit">
        {STATUS_TABS.map((tab) => (
          <Button key={tab} variant={activeTab === tab ? 'secondary' : 'ghost'} size="sm" onClick={() => handleTabChange(tab)}>
            {tab}
          </Button>
        ))}
      </div>

      {/* Orders */}
      {loading ? (
        <LoadingPanel label="Loading orders…" />
      ) : error ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-danger mx-auto mb-2" />
            <p className="text-ink-3">{error}</p>
          </div>
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState
            kind="empty"
            title="No orders found"
            description={activeTab !== 'All' ? `No ${activeTab.toLowerCase()} orders` : 'Orders will appear here once placed'}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order._id} className="p-4 hover:bg-surface-2 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-control bg-accent-soft flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Package className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm tabular font-semibold text-ink">{order.orderNumber}</p>
                      <Badge tone={STATUS_TONE[order.status] ?? 'neutral'}>{order.status}</Badge>
                    </div>
                    <p className="text-xs text-ink-3 mt-1">
                      {formatDate(order.createdAt)} &middot;{' '}
                      {order.items?.length || 0} item
                      {(order.items?.length || 0) !== 1 ? 's' : ''}
                    </p>
                    {order.items?.length > 0 && (
                      <p className="text-xs text-ink-3 mt-1 truncate max-w-xs">
                        {order.items
                          .slice(0, 2)
                          .map((i) => i.name)
                          .join(', ')}
                        {order.items.length > 2 &&
                          ` +${order.items.length - 2} more`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm tabular font-semibold text-ink">{formatCurrency(order.totalAmount)}</p>
                    <p className="text-[10px] text-ink-3 mt-0.5">Total</p>
                  </div>
                  <Link href={`/vendor/orders/${order._id}`}>
                    <Button variant="secondary" size="sm">Details <ChevronRight className="h-3 w-3" /></Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-ink-3">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
