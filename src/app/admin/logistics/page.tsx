'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Truck, MapPin, Package, Clock, RefreshCw, Plug, Search } from 'lucide-react'

const SUPPORTED_COURIERS: { key: string; label: string }[] = [
  { key: 'SHIPROCKET', label: 'Shiprocket' },
  { key: 'DELHIVERY', label: 'Delhivery' },
  { key: 'BLUEDART', label: 'Bluedart' },
  { key: 'XPRESSBEES', label: 'Xpressbees' },
  { key: 'ECOM_EXPRESS', label: 'Ecom Express' },
]

interface CourierIntegrationState {
  isActive: boolean
  configured: boolean
  credentials: Record<string, string>
}

interface RateQuote {
  provider: string
  courierId: string
  courierName: string
  rate: number
  etaDays?: number | null
}

/**
 * Courier Providers panel: shows every supported courier (Shiprocket is the
 * only one with a live integration today — the rest are pluggable stubs
 * that surface a clear "not configured" error until real credentials are
 * added, per the framework-building scope of this feature). Reuses the
 * existing generic /api/integrations endpoints (Integration model now
 * accepts courier provider keys too) rather than new CRUD routes.
 */
function CourierProvidersPanel({ businessId }: { businessId: string | null }) {
  const [states, setStates] = useState<Record<string, CourierIntegrationState>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: integrationsRes } = useSWR(
    businessId ? (['/api/integrations', businessId] as const) : null,
    ([url, bId]: readonly [string, string]) =>
      fetch(url, { headers: { 'x-active-business-id': bId } }).then((r) => (r.ok ? r.json() : null))
  )

  useEffect(() => {
    const integrations = integrationsRes?.integrations
    if (!integrations) return
    const next: Record<string, CourierIntegrationState> = {}
    for (const c of SUPPORTED_COURIERS) {
      const found = integrations.find((i: any) => i.provider === c.key)
      next[c.key] = {
        isActive: !!found?.isActive,
        configured: !!found,
        credentials: found?.config?.credentials || {},
      }
    }
    setStates(next)
  }, [integrationsRes])

  const save = async (key: string) => {
    if (!businessId) return
    setSaving(key)
    try {
      const state = states[key] || { isActive: false, configured: false, credentials: {} }
      await fetch(`/api/integrations/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-active-business-id': businessId },
        body: JSON.stringify({ config: { credentials: state.credentials }, isActive: state.isActive }),
      })
      setStates((p) => ({ ...p, [key]: { ...p[key], configured: true } }))
    } catch {
      // silent
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Plug size={18} className="text-gray-500" /> Courier Providers</h3>
        <p className="text-xs text-gray-400 max-w-md text-right">
          Shiprocket is live today. Other carriers are ready to plug in the moment real API credentials are added.
        </p>
      </div>
      <div className="space-y-3">
        {SUPPORTED_COURIERS.map((c) => {
          const state = states[c.key] || { isActive: false, configured: false, credentials: {} }
          const isShiprocket = c.key === 'SHIPROCKET'
          return (
            <div key={c.key} className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{c.label}</p>
                  <p className="text-xs text-gray-500">
                    {isShiprocket
                      ? 'Configured via server environment variables'
                      : state.configured
                      ? 'Credentials saved'
                      : 'Not yet configured — add API credentials to enable'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setStates((p) => ({ ...p, [c.key]: { ...state, isActive: !state.isActive } }))}
                    disabled={isShiprocket}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 ${state.isActive ? 'bg-emerald-500' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${state.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  {!isShiprocket && (
                    <button
                      onClick={() => setExpanded((p) => (p === c.key ? null : c.key))}
                      className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:text-gray-900 hover:border-gray-400"
                    >
                      {expanded === c.key ? 'Hide' : 'Configure'}
                    </button>
                  )}
                </div>
              </div>

              {!isShiprocket && expanded === c.key && (
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-500">
                    Store any credential fields this provider's API requires (API key, client id/secret, etc.).
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Credential key (e.g. apiKey)"
                      className="rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900"
                      id={`key-${c.key}`}
                    />
                    <input
                      placeholder="Value"
                      className="rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900"
                      id={`val-${c.key}`}
                    />
                  </div>
                  <button
                    onClick={() => {
                      const keyInput = document.getElementById(`key-${c.key}`) as HTMLInputElement
                      const valInput = document.getElementById(`val-${c.key}`) as HTMLInputElement
                      if (!keyInput?.value) return
                      setStates((p) => ({
                        ...p,
                        [c.key]: {
                          ...state,
                          credentials: { ...state.credentials, [keyInput.value]: valInput?.value || '' },
                        },
                      }))
                      keyInput.value = ''
                      if (valInput) valInput.value = ''
                    }}
                    className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:text-gray-900 hover:border-gray-400"
                  >
                    + Add credential field
                  </button>
                  {Object.keys(state.credentials).length > 0 && (
                    <ul className="text-xs text-gray-500 space-y-1">
                      {Object.entries(state.credentials).map(([k]) => (
                        <li key={k}>{k}: ••••••</li>
                      ))}
                    </ul>
                  )}
                  <button
                    onClick={() => save(c.key)}
                    disabled={saving === c.key}
                    className="rounded-lg bg-gray-900 text-white px-4 py-1.5 text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    {saving === c.key ? 'Saving…' : 'Save Configuration'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Best-rate comparison: calls /api/shipping/compare-rates for a given order
 * and shows every provider's quote sorted cheapest-first, with the cheapest
 * highlighted. This is the "best of the best service in affordable rates"
 * requirement — unconfigured providers are simply absent from the list
 * rather than showing an error.
 */
function RateComparisonPanel() {
  const [orderId, setOrderId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<RateQuote[] | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])

  const run = async () => {
    if (!orderId.trim()) return
    setLoading(true)
    setError(null)
    setQuotes(null)
    try {
      const res = await fetch('/api/shipping/compare-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderId: orderId.trim() }),
      })
      const d = await res.json()
      if (!d.success) {
        setError(d.message || 'Failed to compare rates')
      } else {
        setQuotes(d.quotes || [])
        setSkipped(d.skippedProviders || [])
      }
    } catch {
      setError('Failed to compare rates')
    }
    setLoading(false)
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Best Rate Comparison</h3>
      <div className="flex gap-3">
        <input
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          placeholder="Order ID"
          className="flex-1 rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
        />
        <button
          onClick={run}
          disabled={loading}
          className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
        >
          <Search size={14} /> {loading ? 'Comparing…' : 'Compare'}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {quotes && (
        <div className="mt-6 space-y-2">
          {quotes.length === 0 ? (
            <p className="text-sm text-gray-400">No quotes available from any configured provider for this order.</p>
          ) : (
            quotes.map((q, i) => (
              <div
                key={`${q.provider}-${q.courierId}`}
                className={`flex items-center justify-between rounded-xl border px-5 py-3 ${i === 0 ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}
              >
                <div>
                  <p className="font-medium text-gray-900">{q.courierName} <span className="text-xs text-gray-400">({q.provider})</span></p>
                  {q.etaDays != null && <p className="text-xs text-gray-500">ETA ~{q.etaDays}d</p>}
                </div>
                <div className="text-right">
                  <p className={`text-lg font-semibold ${i === 0 ? 'text-blue-600' : 'text-gray-900'}`}>₹{q.rate}</p>
                  {i === 0 && <p className="text-xs text-blue-600">Best rate</p>}
                </div>
              </div>
            ))
          )}
          {skipped.length > 0 && (
            <p className="text-xs text-gray-400 pt-2">Skipped (not configured): {skipped.join(', ')}</p>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * MOVED from src/app/logistics/page.tsx (orphaned root-level route, not
 * reachable from the live sidebar, and previously rendered nothing but
 * hardcoded numbers) to src/app/admin/logistics — the conventional
 * location for admin features. Now wired to the real /api/logistics/overview
 * route, which reads shipment data from Order.shipping (the actual live
 * schema — there's no separate Shipment model in this codebase; see that
 * route's comments for detail). "Delivery Zones" from the original mock UI
 * has no real backing concept in the schema (no region/zone field
 * anywhere), so it's replaced with "Courier Partners" (a real, honestly
 * computed count) rather than continuing to show a fabricated number.
 */
export default function LogisticsPage() {
  const [businessId, setBusinessId] = useState<string | null>(null)

  const { data: meRes } = useSWR('/api/auth/me')
  useEffect(() => {
    if (!meRes) return
    const businesses = meRes?.businesses || []
    const bId: string | null = meRes?.user?.activeBusinessId || businesses?.[0]?._id || null
    setBusinessId(bId)
  }, [meRes])

  const { data: overviewRes, isLoading: loading, mutate: load } = useSWR('/api/logistics/overview')
  const data = overviewRes?.success ? overviewRes : null
  const error: string | null = overviewRes && !overviewRes.success ? overviewRes.error || 'Failed to load logistics data' : null

  const stats = data ? [
    { title: 'Active Shipments', value: String(data.activeShipments ?? 0), icon: Truck },
    { title: 'Warehouses', value: String(data.warehouseCount ?? 0), icon: Package },
    { title: 'Courier Partners', value: String(data.courierPartnersInUse ?? 0), icon: MapPin },
    { title: 'Avg Delivery', value: data.avgDeliveryDays !== null ? `${data.avgDeliveryDays}d` : '—', icon: Clock },
  ] : []

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Supply Chain</p>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900">Logistics</h1>
            <p className="text-sm text-gray-400 mt-1">Shipments, warehouse coverage, and delivery performance across every order.</p>
          </div>
          <button onClick={() => load()} className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition">
            <RefreshCw size={16} className="text-gray-500" />
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-600 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading logistics data…</div>
        ) : (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((item, index) => {
                const Icon = item.icon
                return (
                  <div key={index} className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-gray-500 text-sm">{item.title}</span>
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Icon size={16} className="text-gray-700" />
                      </div>
                    </div>
                    <p className="text-2xl font-semibold text-gray-900">{item.value}</p>
                  </div>
                )
              })}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Shipments</h3>
              {(data?.recentShipments || []).length === 0 ? (
                <p className="text-gray-400 text-sm">No shipments created yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.recentShipments.map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{s.invoiceNumber || s.orderId}</p>
                        <p className="text-xs text-gray-500">{s.courierPartner || 'Courier not assigned'} {s.awbNumber ? `· AWB ${s.awbNumber}` : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-900">{s.trackingStatus || 'Pending'}</p>
                        {s.trackingUrl && (
                          <a href={s.trackingUrl} target="_blank" rel="noreferrer" className="text-xs underline text-gray-400 hover:text-gray-900">
                            Track
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <RateComparisonPanel />

            <CourierProvidersPanel businessId={businessId} />
          </>
        )}
      </div>
    </div>
  )
}
