'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Package, ShoppingCart, BarChart3,
  Truck, Hash, ArrowRight, Store, Layers, Smartphone,
} from 'lucide-react'

interface NativeStats {
  products: number
  orders: number
  inventory: number
  vendors: number
  loadingProducts: boolean
  loadingOrders: boolean
  loadingInventory: boolean
  loadingVendors: boolean
}

export default function NativePage() {
  const router = useRouter()

  const { data: productsD, isLoading: loadingProducts } = useSWR('/api/products?limit=1')
  const productsTotal = productsD?.total ?? (Array.isArray(productsD) ? productsD.length : (productsD?.products?.length ?? 0))

  // /api/orders/list is the real Native customer-order model (Order.ts) —
  // /api/sales/orders is a separate manual B2B "SalesOrder" model and was
  // giving a misleading count here.
  const { data: ordersD, isLoading: loadingOrders } = useSWR('/api/orders/list?limit=1')
  const ordersTotal = ordersD?.total ?? (Array.isArray(ordersD) ? ordersD.length : (ordersD?.orders?.length ?? 0))

  const { data: vendorsD, isLoading: loadingVendors } = useSWR('/api/vendors?limit=1')
  const vendorsTotal = vendorsD?.total ?? (Array.isArray(vendorsD) ? vendorsD.length : (vendorsD?.vendors?.length ?? 0))

  const stats: NativeStats = {
    products: productsTotal,
    orders: ordersTotal,
    inventory: productsTotal,
    vendors: vendorsTotal,
    loadingProducts,
    loadingOrders,
    loadingInventory: loadingProducts,
    loadingVendors,
  }

  const sections = [
    {
      href: '/admin/products',
      icon: Package,
      title: 'Products',
      description: 'Manage product catalog, pricing, HSN codes, GST rates, and SEO.',
      stat: stats.products,
      statLabel: 'products',
      loading: stats.loadingProducts,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      href: '/admin/native/orders',
      icon: ShoppingCart,
      title: 'Orders',
      description: 'Track and manage customer orders from placement to delivery.',
      stat: stats.orders,
      statLabel: 'orders',
      loading: stats.loadingOrders,
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      href: '/admin/inventory',
      icon: BarChart3,
      title: 'Inventory',
      description: 'Monitor stock levels, lot management, and reorder alerts.',
      stat: stats.inventory,
      statLabel: 'items in stock',
      loading: stats.loadingInventory,
      color: 'bg-violet-50 text-violet-600',
    },
    {
      href: '/admin/vendors',
      icon: Truck,
      title: 'Vendors',
      description: 'Onboard suppliers, manage vendor profiles and payment terms.',
      stat: stats.vendors,
      statLabel: 'vendors',
      loading: stats.loadingVendors,
      color: 'bg-amber-50 text-amber-600',
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <button
            onClick={() => router.push('/admin')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Native Store</h1>
              <p className="text-sm text-gray-500">Ecommerce business management</p>
            </div>
          </div>
        </div>

        {/* Section Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {sections.map(({ href, icon: Icon, title, description, stat, statLabel, loading, color }) => (
            <Link
              key={href}
              href={href}
              className="rounded-2xl border border-gray-200 bg-white p-6 hover:shadow-sm hover:border-gray-300 transition group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-500 mb-4">{description}</p>
              <div className="flex items-baseline gap-2">
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                ) : (
                  <>
                    <span className="text-2xl font-bold text-gray-900">{stat.toLocaleString()}</span>
                    <span className="text-sm text-gray-500">{statLabel}</span>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Document Numbers */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Hash className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Document Series</p>
                  <p className="text-sm text-gray-500">Invoice & PO numbering</p>
                </div>
              </div>
              <Link
                href="/admin/business"
                title="Document numbering now lives on each business's own view page (Document Numbering section) -- open Native's business record from here."
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                Configure <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* API Integration */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Native App SDK</p>
                  <p className="text-sm text-gray-500">Connect your mobile frontend</p>
                </div>
              </div>
              <Link
                href="/admin/sso"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                SDK Docs <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Mobile App Settings (Android/iOS app in /mobile) */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Mobile App Settings</p>
                  <p className="text-sm text-gray-500">Business tenant, iOS/Android min version, force-update, maintenance mode</p>
                </div>
              </div>
              <Link
                href="/admin/native/mobile-settings"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                Configure <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
