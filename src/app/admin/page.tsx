'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TrendingUp, ShoppingCart, FileText, Clock, Package, Truck, BarChart3, ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { getAuthMe } from '@/lib/authMeCache'

interface Invoice { _id: string; invoiceNumber: string; customerName: string; totalAmount: number; status: string; createdAt: string }
interface Order   { _id: string; orderNumber: string;  customerName: string; totalAmount: number; status: string; createdAt: string }
interface UserData { name: string; email: string }

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  PAID: 'success', DELIVERED: 'success',
  DRAFT: 'neutral', CANCELLED: 'danger', OVERDUE: 'danger',
  SENT: 'info', CONFIRMED: 'info',
  PROCESSING: 'warning',
  SHIPPED: 'info',
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-ink-3">{label}</span>
        <div className="w-9 h-9 rounded-control flex items-center justify-center bg-accent-soft">
          <Icon className="w-4 h-4 text-accent" />
        </div>
      </div>
      <p className="tabular text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="text-xs text-ink-3 mt-1">{sub}</p>}
    </Card>
  )
}

export default function AdminDashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [orders, setOrders]     = useState<Order[]>([])
  const [user, setUser]         = useState<UserData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [invRes, ordRes, userData] = await Promise.all([
          fetch('/api/sales/invoices'),
          fetch('/api/sales/orders'),
          getAuthMe(),
        ])
        if (invRes.ok) {
          const data = await invRes.json()
          setInvoices(Array.isArray(data) ? data : (data.invoices ?? []))
        }
        if (ordRes.ok) {
          const data = await ordRes.json()
          setOrders(Array.isArray(data) ? data : (data.orders ?? []))
        }
        setUser(userData?.user ?? userData)
      } catch { setError('Failed to load dashboard data') }
      finally { setLoading(false) }
    }
    fetchAll()
  }, [])

  const totalRevenue  = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + (i.totalAmount ?? 0), 0)
  const pendingAmount = invoices.filter(i => ['SENT','OVERDUE','DRAFT'].includes(i.status)).reduce((s, i) => s + (i.totalAmount ?? 0), 0)
  const recentInvoices = [...invoices].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
  const recentOrders  = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const fmt   = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <LoadingPanel label="Loading your dashboard…" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg p-6">
      <div>
        <PageHeader
          eyebrow={today}
          title={user ? `Welcome back, ${user.name.split(' ')[0]}` : 'Dashboard'}
        />
        {error && (
          <p className="-mt-4 mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-2 inline-block">{error}</p>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={TrendingUp}  label="Total Revenue"   value={fmt(totalRevenue)}    sub="From paid invoices" />
          <StatCard icon={ShoppingCart} label="Total Orders"   value={String(orders.length)} sub="All time" />
          <StatCard icon={FileText}    label="Total Invoices"  value={String(invoices.length)} sub="All time" />
          <StatCard icon={Clock}       label="Pending Amount"  value={fmt(pendingAmount)}   sub="Unpaid invoices" />
        </div>

        {/* Recent Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="h-section">Recent Invoices</h2>
              <Link href="/admin/sales" className="text-xs text-ink-3 hover:text-ink flex items-center gap-1 transition">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {recentInvoices.length === 0 ? (
                <EmptyState kind="empty" title="No invoices yet" />
              ) : recentInvoices.map(inv => (
                <div key={inv._id} className="px-5 py-3 flex items-center justify-between hover:bg-surface-2 transition">
                  <div>
                    <p className="text-sm font-medium text-ink">{inv.invoiceNumber}</p>
                    <p className="text-xs text-ink-3">{inv.customerName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular text-sm font-medium text-ink">{fmt(inv.totalAmount)}</span>
                    <Badge tone={STATUS_TONE[inv.status] ?? 'neutral'}>{inv.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="h-section">Recent Orders</h2>
              <Link href="/admin/orders" className="text-xs text-ink-3 hover:text-ink flex items-center gap-1 transition">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {recentOrders.length === 0 ? (
                <EmptyState kind="empty" title="No orders yet" />
              ) : recentOrders.map(ord => (
                <div key={ord._id} className="px-5 py-3 flex items-center justify-between hover:bg-surface-2 transition">
                  <div>
                    <p className="text-sm font-medium text-ink">{ord.orderNumber}</p>
                    <p className="text-xs text-ink-3">{ord.customerName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular text-sm font-medium text-ink">{fmt(ord.totalAmount)}</span>
                    <Badge tone={STATUS_TONE[ord.status] ?? 'neutral'}>{ord.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <h2 className="h-section mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { href: '/admin/orders',    icon: ShoppingCart, label: 'Orders',    desc: 'Manage customer orders' },
            { href: '/admin/products',  icon: Package,      label: 'Products',  desc: 'Manage product catalog' },
            { href: '/admin/vendors',   icon: Truck,        label: 'Vendors',   desc: 'Vendor onboarding' },
            { href: '/admin/inventory', icon: BarChart3,    label: 'Inventory', desc: 'Stock management' },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link key={href} href={href}>
              <Card className="p-5 hover:shadow-card-lg hover:border-accent/40 transition group">
                <div className="w-10 h-10 rounded-control bg-surface-2 group-hover:bg-accent flex items-center justify-center mb-4 transition-colors">
                  <Icon className="w-5 h-5 text-ink-3 group-hover:text-accent-fg transition-colors" />
                </div>
                <p className="font-semibold text-ink mb-1 text-sm">{label}</p>
                <p className="text-xs text-ink-3">{desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
