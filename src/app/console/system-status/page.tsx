'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Database,
  Send,
} from 'lucide-react'

interface ModuleDef {
  key: string
  label: string
  url: string
}

type Status = 'checking' | 'ready' | 'slow' | 'down'

interface ModuleResult {
  status: Status
  ms: number | null
  error?: string
}

// One representative GET endpoint per module. Each is hit with a plain
// fetch and timed client-side — this is a lightweight health probe, not
// a full data load, so it reflects real page-load latency without the
// cost of rendering large result sets.
const MODULES: ModuleDef[] = [
  { key: 'db', label: 'Database Connection', url: '/api/health/db' },
  { key: 'dashboard', label: 'Dashboard', url: '/api/dashboard/overview' },
  { key: 'inventory', label: 'Inventory', url: '/api/inventory/items?limit=1' },
  { key: 'sales', label: 'Sales Orders', url: '/api/sales/orders?limit=1' },
  { key: 'purchase', label: 'Purchase Orders', url: '/api/purchase/orders?limit=1' },
  { key: 'crm', label: 'CRM / Leads', url: '/api/crm/leads?limit=1' },
  { key: 'finance', label: 'Finance / Invoices', url: '/api/finance/invoices?limit=1' },
  { key: 'employees', label: 'Employees', url: '/api/employees?limit=1' },
  { key: 'chat', label: 'Chat', url: '/api/chat/rooms' },
  { key: 'agreements', label: 'Agreements', url: '/api/agreements/list?limit=1' },
  { key: 'businesses', label: 'Businesses', url: '/api/businesses/list' },
  { key: 'vendors', label: 'Vendors', url: '/api/vendors?limit=1' },
  { key: 'users', label: 'Users', url: '/api/users?limit=1' },
  { key: 'products', label: 'Products', url: '/api/products?limit=1' },
  { key: 'orders', label: 'Orders', url: '/api/orders/list?limit=1' },
  { key: 'warehouses', label: 'Warehouses', url: '/api/warehouses' },
  { key: 'materials', label: 'Materials', url: '/api/materials?limit=1' },
  { key: 'production', label: 'Production Orders', url: '/api/production/orders?limit=1' },
]

const SLOW_THRESHOLD_MS = 1200

function classify(ok: boolean, ms: number): Status {
  if (!ok) return 'down'
  if (ms > SLOW_THRESHOLD_MS) return 'slow'
  return 'ready'
}

const STATUS_STYLES: Record<Status, { badge: string; icon: React.ReactNode; label: string }> = {
  checking: {
    badge: 'bg-gray-50 text-gray-500 border-gray-200',
    icon: <Loader2 size={13} className="animate-spin" />,
    label: 'Checking…',
  },
  ready: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: <CheckCircle2 size={13} />,
    label: 'Ready',
  },
  slow: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <AlertTriangle size={13} />,
    label: 'Slow',
  },
  down: {
    badge: 'bg-red-50 text-red-700 border-red-200',
    icon: <XCircle size={13} />,
    label: 'Down',
  },
}

export default function SystemStatusPage() {
  const [results, setResults] = useState<Record<string, ModuleResult>>({})
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState<Date | null>(null)

  // Telegram webhook -- Telegram refuses to follow redirects on webhook
  // delivery, so a webhook registered against a domain that 307/308s
  // elsewhere (e.g. an apex domain redirecting to www) silently never
  // fires. This panel lets a Super Admin check the current registration
  // and re-register it against this deployment's own NEXT_PUBLIC_APP_URL,
  // server-side, instead of hand-typing the bot token into a browser URL
  // bar (see api/telegram/set-webhook's comment).
  const [webhookInfo, setWebhookInfo] = useState<any>(null)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookRegistering, setWebhookRegistering] = useState(false)
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null)

  const checkWebhook = useCallback(async () => {
    setWebhookLoading(true)
    setWebhookMsg(null)
    try {
      const res = await fetch('/api/telegram/set-webhook')
      const d = await res.json()
      if (d.success) setWebhookInfo(d.info)
      else setWebhookMsg(d.error || 'Failed to check webhook')
    } catch {
      setWebhookMsg('Failed to reach the server')
    } finally {
      setWebhookLoading(false)
    }
  }, [])

  async function registerWebhook() {
    setWebhookRegistering(true)
    setWebhookMsg(null)
    try {
      const res = await fetch('/api/telegram/set-webhook', { method: 'POST' })
      const d = await res.json()
      if (d.success) {
        setWebhookMsg(`Registered: ${d.webhookUrl}`)
        checkWebhook()
      } else {
        setWebhookMsg(d.error || 'Failed to register webhook')
      }
    } catch {
      setWebhookMsg('Failed to reach the server')
    } finally {
      setWebhookRegistering(false)
    }
  }

  useEffect(() => {
    checkWebhook()
  }, [checkWebhook])

  const runChecks = useCallback(async () => {
    setRunning(true)
    setResults(
      Object.fromEntries(MODULES.map((m) => [m.key, { status: 'checking', ms: null }]))
    )

    await Promise.all(
      MODULES.map(async (m) => {
        const started = performance.now()
        try {
          const res = await fetch(m.url, { method: 'GET', cache: 'no-store' })
          const ms = Math.round(performance.now() - started)
          const ok = res.ok
          setResults((prev) => ({
            ...prev,
            [m.key]: { status: classify(ok, ms), ms, error: ok ? undefined : `HTTP ${res.status}` },
          }))
        } catch (err: any) {
          const ms = Math.round(performance.now() - started)
          setResults((prev) => ({
            ...prev,
            [m.key]: { status: 'down', ms, error: err?.message || 'Network error' },
          }))
        }
      })
    )

    setRunning(false)
    setLastRun(new Date())
  }, [])

  useEffect(() => {
    runChecks()
  }, [runChecks])

  const summary = MODULES.reduce(
    (acc, m) => {
      const s = results[m.key]?.status
      if (s === 'ready') acc.ready++
      else if (s === 'slow') acc.slow++
      else if (s === 'down') acc.down++
      else acc.checking++
      return acc
    },
    { ready: 0, slow: 0, down: 0, checking: 0 }
  )

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">Admin</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-0.5">System / Module Status</h1>
          <p className="text-sm text-gray-500 mt-1">
            Live check of each module&apos;s API — response time and health, measured from your
            browser right now.
          </p>
        </div>
        <button
          onClick={runChecks}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm bg-gray-900 hover:bg-gray-800 text-white transition-all disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Re-check now
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs text-emerald-700 uppercase tracking-wider">Ready</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{summary.ready}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-700 uppercase tracking-wider">Slow</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{summary.slow}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-700 uppercase tracking-wider">Down</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{summary.down}</p>
        </div>
      </div>

      {/* Module list */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Modules</h2>
          {lastRun && (
            <p className="text-xs text-gray-500">
              Last checked {lastRun.toLocaleTimeString('en-IN')}
            </p>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {MODULES.map((m) => {
            const r = results[m.key] || { status: 'checking' as Status, ms: null }
            const style = STATUS_STYLES[r.status]
            return (
              <div key={m.key} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  {m.key === 'db' ? (
                    <Database className="h-4 w-4 text-gray-400" />
                  ) : (
                    <span className="h-4 w-4" />
                  )}
                  <div>
                    <p className="text-sm text-gray-900 font-medium">{m.label}</p>
                    {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {r.ms !== null && (
                    <span className="text-xs text-gray-500 font-mono">{r.ms} ms</span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border ${style.badge}`}
                  >
                    {style.icon}
                    {style.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Telegram webhook */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Telegram Bot Webhook</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={checkWebhook}
              disabled={webhookLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              {webhookLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Check
            </button>
            <button
              onClick={registerWebhook}
              disabled={webhookRegistering}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-gray-900 hover:bg-gray-800 text-white disabled:opacity-50"
            >
              {webhookRegistering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Register Webhook
            </button>
          </div>
        </div>
        <div className="px-5 py-4 text-sm space-y-1.5">
          {webhookMsg && <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{webhookMsg}</p>}
          {webhookInfo ? (
            <>
              <p><span className="text-gray-500">Registered URL:</span> <span className="font-mono text-xs">{webhookInfo.url || '(not set)'}</span></p>
              <p><span className="text-gray-500">Pending updates:</span> {webhookInfo.pending_update_count ?? 0}</p>
              {webhookInfo.last_error_message && (
                <p className="text-red-600 text-xs mt-1">
                  Last error: {webhookInfo.last_error_message}
                  {webhookInfo.last_error_date && ` (${new Date(webhookInfo.last_error_date * 1000).toLocaleString('en-IN')})`}
                </p>
              )}
              {!webhookInfo.last_error_message && webhookInfo.url && (
                <p className="text-emerald-700 text-xs mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> No delivery errors reported</p>
              )}
            </>
          ) : (
            !webhookLoading && <p className="text-xs text-gray-400">No webhook info loaded.</p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            &quot;Register Webhook&quot; points Telegram at this deployment&apos;s own configured domain
            (NEXT_PUBLIC_APP_URL) server-side — safer than typing the bot token into a browser URL,
            and avoids accidentally registering against a domain that redirects (Telegram won&apos;t
            follow redirects on webhook delivery).
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        &quot;Slow&quot; means the response took longer than {SLOW_THRESHOLD_MS}ms. &quot;Down&quot;
        means the request failed or returned an error status. This page measures the API only —
        actual page load also includes rendering time.
      </p>
    </div>
  )
}
