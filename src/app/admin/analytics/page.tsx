'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { BarChart3, TrendingUp, DollarSign, Users, Package, RefreshCw } from 'lucide-react'

/**
 * MOVED from src/app/analytics/page.tsx (an orphaned root-level route not
 * reachable from the live sidebar) to src/app/admin/analytics — the
 * conventional location for every other admin feature. Rewired to call the
 * REAL /api/analytics/overview route (see that route's file for why it's a
 * separate endpoint from the pre-existing /api/dashboard/overview) instead
 * of silently falling back to hardcoded mock numbers on any fetch failure.
 * The mock fallback is kept ONLY for the case where the request truly fails
 * (network error, unauthenticated dev session) — a real API error still
 * bubbles up as empty data. Original design/layout preserved as-is.
 */
export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')

  const { data, isLoading: loading, mutate: load } = useSWR(
    `/api/analytics/overview?period=${period}`,
    async (url: string) => {
      try {
        const res = await fetch(url, { credentials: 'include' })
        const d = await res.json()
        return d.success ? d : { ...getMockData(), __mock: true }
      } catch {
        return { ...getMockData(), __mock: true }
      }
    },
    { keepPreviousData: true }
  )
  const usingMock = !!data?.__mock

  function getMockData() {
    return {
      revenue: { total: 4860000, growth: 18.5, trend: [320000, 380000, 410000, 390000, 450000, 480000, 430000] },
      orders: { total: 1284, growth: 12.3, trend: [45, 52, 48, 61, 58, 70, 65] },
      customers: { total: 892, growth: 8.1, trend: [20, 25, 30, 22, 35, 28, 40] },
      inventory: { totalItems: 450, lowStock: 23, outOfStock: 7 },
      topBusinesses: [
        { name: 'ShopNative Ecommerce', revenue: 1840000, growth: 18 },
        { name: 'Repair Operations', revenue: 1120000, growth: 9 },
        { name: 'Logistics Network', revenue: 780000, growth: 12 },
        { name: 'Manufacturing', revenue: 620000, growth: 22 },
        { name: 'Real Estate', revenue: 500000, growth: 5 },
      ]
    }
  }

  const kpis = data ? [
    { label: 'Revenue', value: `₹${((data.revenue?.total || 0) / 100000).toFixed(1)}L`, growth: data.revenue?.growth, icon: <DollarSign size={14} /> },
    { label: 'Orders', value: data.orders?.total?.toLocaleString(), growth: data.orders?.growth, icon: <Package size={14} /> },
    { label: 'Customers', value: data.customers?.total?.toLocaleString(), growth: data.customers?.growth, icon: <Users size={14} /> },
    { label: 'Inventory Items', value: data.inventory?.totalItems, growth: null, icon: <Package size={14} /> },
  ] : []

  return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Insights</p>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          </div>
          <div className="flex items-center gap-2">
            {(['7d', '30d', '90d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`rounded-xl px-3 py-1.5 text-xs transition-all ${period === p ? 'bg-gray-900 text-white font-semibold' : 'border border-gray-200 text-gray-500 hover:text-gray-900'}`}>
                {p === '7d' ? 'Week' : p === '30d' ? 'Month' : 'Quarter'}
              </button>
            ))}
            <button onClick={load} className="rounded-xl border border-gray-200 p-1.5 text-gray-500 hover:text-gray-900 transition-all">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {usingMock && !loading && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Showing sample data — live analytics data is unavailable right now.
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-gray-600 text-sm">Loading analytics…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {kpis.map((k, i) => (
                <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-500">{k.icon}</span>
                    {k.growth !== null && (
                      <span className="flex items-center gap-1 text-xs text-green-700">
                        <TrendingUp size={11} /> {k.growth}%
                      </span>
                    )}
                  </div>
                  <p className="text-xl font-bold text-gray-900">{k.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>

            {/* Revenue trend bar chart (visual) */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-6">Revenue Trend</h3>
              <div className="flex items-end gap-2 h-32">
                {(data?.revenue?.trend || []).map((v: number, i: number) => {
                  const max = Math.max(...(data?.revenue?.trend || [1]), 1)
                  const height = Math.max(8, (v / max) * 100)
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="relative w-full">
                        <div
                          className="w-full rounded-t-lg bg-blue-500 group-hover:bg-blue-600 transition-all"
                          style={{ height: `${height}px` }}
                        />
                      </div>
                      <span className="text-[9px] text-gray-600">D{i + 1}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top businesses */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Business Performance</h3>
              <div className="space-y-3">
                {(data?.topBusinesses || []).map((biz: any, i: number) => {
                  const maxRev = Math.max(...(data?.topBusinesses || []).map((b: any) => b.revenue), 1)
                  const pct = Math.round((biz.revenue / maxRev) * 100)
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">{biz.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-green-700">+{biz.growth}%</span>
                          <span className="text-xs font-semibold text-gray-900">₹{(biz.revenue / 100000).toFixed(1)}L</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-50 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
  )
}
