'use client'

import useSWR from 'swr'
import Link from 'next/link'
import {
  ShoppingCart,
  Clock,
  TrendingUp,
  AlertCircle,
  Plus,
  BarChart3,
  FileText,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

interface DashboardData {
  vendor: {
    companyName: string
    vendorId: string
  }
  stats: {
    totalOrders: number
    pendingOrders: number
    totalRevenue: number
    outstanding: number
  }
  orders: Array<{
    _id: string
    orderNumber: string
    createdAt: string
    totalAmount: number
    status: string
    items: Array<{ name: string }>
  }>
  invoices: Array<{
    _id: string
    invoiceNumber: string
    totalAmount: number
    dueDate: string
    status: string
  }>
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  PENDING: 'warning',
  PROCESSING: 'info',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  PAID: 'success',
  OVERDUE: 'danger',
  SENT: 'info',
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

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-ink-3">{label}</p>
        <div className="h-7 w-7 rounded-control bg-accent-soft flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-accent" />
        </div>
      </div>
      <p className="tabular text-2xl font-bold text-ink">{value}</p>
      <p className="text-xs text-ink-3 mt-1">{sub}</p>
    </Card>
  )
}

const QUICK_ACTIONS = [
  { href: '/vendor/products', icon: Plus, label: 'Submit New Product' },
  { href: '/vendor/statement', icon: BarChart3, label: 'View Statement' },
  { href: '/vendor/orders', icon: ShoppingCart, label: 'Track Orders' },
  { href: '/vendor/invoices', icon: FileText, label: 'View Invoices' },
]

export default function VendorDashboard() {
  const { data: res, isLoading: loading, error: swrError } = useSWR('/api/vendor/dashboard')
  const data: DashboardData | null = res?.success ? res.data : null
  const error = swrError ? 'Failed to load dashboard' : (res && !res.success ? (res.message || 'Failed to load dashboard') : '')

  if (loading) return <LoadingPanel label="Loading your dashboard…" />

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-danger mx-auto mb-2" />
          <p className="text-ink-3">{error}</p>
        </div>
      </div>
    )
  }

  const stats = data?.stats
  const orders = data?.orders || []
  const invoices = data?.invoices || []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vendor Portal"
        title={`Welcome back, ${data?.vendor?.companyName || 'Vendor'}`}
        description={<span className="tabular">Vendor ID: {data?.vendor?.vendorId}</span>}
        actions={
          <>
            <Link href="/vendor/statement"><Button variant="secondary" icon={<BarChart3 className="h-4 w-4" />}>Statement</Button></Link>
            <Link href="/vendor/products/new"><Button icon={<Plus className="h-4 w-4" />}>New Product</Button></Link>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ShoppingCart} label="Total Orders" value={String(stats?.totalOrders ?? 0)} sub="All time" />
        <StatCard icon={Clock} label="Pending Orders" value={String(stats?.pendingOrders ?? 0)} sub="Awaiting action" />
        <StatCard icon={TrendingUp} label="Total Revenue" value={formatCurrency(stats?.totalRevenue ?? 0)} sub="Lifetime earnings" />
        <StatCard icon={AlertCircle} label="Outstanding" value={formatCurrency(stats?.outstanding ?? 0)} sub="Unpaid balance" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Orders */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="h-section">Recent Orders</h2>
            <Link href="/vendor/orders" className="text-xs text-ink-3 hover:text-ink transition-colors">View all →</Link>
          </div>
          {orders.length === 0 ? (
            <EmptyState kind="empty" title="No orders yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Order #</th>
                    <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Date</th>
                    <th className="px-5 py-3 text-right text-[10px] uppercase tracking-wider text-ink-3">Amount</th>
                    <th className="px-5 py-3 text-right text-[10px] uppercase tracking-wider text-ink-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order._id} className="border-b border-border hover:bg-surface-2 transition-colors">
                      <td className="px-5 py-3 text-sm tabular text-ink-2">{order.orderNumber}</td>
                      <td className="px-5 py-3 text-sm text-ink-3">{formatDate(order.createdAt)}</td>
                      <td className="px-5 py-3 text-sm tabular text-right text-ink">{formatCurrency(order.totalAmount)}</td>
                      <td className="px-5 py-3 text-right"><Badge tone={STATUS_TONE[order.status] ?? 'neutral'}>{order.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Pending Invoices */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="h-section">Pending Invoices</h2>
            <Link href="/vendor/invoices" className="text-xs text-ink-3 hover:text-ink transition-colors">View all →</Link>
          </div>
          {invoices.length === 0 ? (
            <EmptyState kind="empty" title="No pending invoices" />
          ) : (
            <div className="divide-y divide-border">
              {invoices.map((invoice) => (
                <div key={invoice._id} className="px-5 py-3.5 hover:bg-surface-2 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-control bg-accent-soft flex items-center justify-center flex-shrink-0">
                        <FileText className="h-3.5 w-3.5 text-accent" />
                      </div>
                      <div>
                        <p className="text-xs tabular text-ink-2">{invoice.invoiceNumber}</p>
                        <p className="text-[10px] text-ink-3 mt-0.5">Due {formatDate(invoice.dueDate)}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm tabular font-semibold text-ink">{formatCurrency(invoice.totalAmount)}</p>
                      <Badge tone={STATUS_TONE[invoice.status] ?? 'neutral'}>{invoice.status}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="p-5">
        <h2 className="h-section mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-2 p-4 rounded-control border border-border hover:bg-surface-2 hover:border-accent/40 transition-all group"
            >
              <div className="h-9 w-9 rounded-control bg-accent-soft flex items-center justify-center group-hover:bg-accent transition-colors">
                <Icon className="h-4 w-4 text-accent group-hover:text-accent-fg transition-colors" />
              </div>
              <span className="text-xs text-ink-2 group-hover:text-ink transition-colors text-center">{label}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}
