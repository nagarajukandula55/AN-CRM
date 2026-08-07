'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Landmark, Send, RefreshCw, Settings2, AlertCircle, CheckCircle2, Clock } from 'lucide-react'

/**
 * GST Filing — src/app/console/gst.
 *
 * Built per explicit user request: "push our bills to gst portal directly
 * and also our assistant should assist with all the processes and
 * pendings," later extended to "GST page should be like actual GST page"
 * with a real date-range push flow. Three tabs: Push (select a date range,
 * push every invoice issued in it to the configured GSP in one action),
 * Filings (per-invoice queue/submit/status), and Settings (GSTIN + GSP
 * credentials, backed by GstPortalConfig). The actual HTTP call to the GSP
 * lives in services/gst/gspClient.service.ts — see that file's top comment
 * for the exact request shape assumed (modeled on the common ClearTax/
 * Cygnet/Masters India/NIC-IRP contract) and for why it throws a clear
 * "not configured" error instead of faking success when no real GSP
 * credentials have been added yet.
 */

type Tab = 'push' | 'filings' | 'config' | 'hsn'

interface Filing {
  _id: string
  invoiceNumber: string
  returnType: string
  period: string
  status: string
  rejectionReason?: string
  portalReferenceId?: string
  createdAt: string
}

interface HsnRate {
  _id: string
  businessId: string | null
  hsnCode: string
  gstRate: number
  category?: string
  description?: string
}

export default function GstFilingPage() {
  const [tab, setTab] = useState<Tab>('push')
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const [gstin, setGstin] = useState('')
  const [provider, setProvider] = useState('NONE')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [isEnabled, setIsEnabled] = useState(false)
  const [autoSubmit, setAutoSubmit] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const [pushFrom, setPushFrom] = useState(firstOfMonth)
  const [pushTo, setPushTo] = useState(today)
  const [pushReturnType, setPushReturnType] = useState<'GSTR1' | 'GSTR3B' | 'IFF'>('GSTR1')
  const [pushing, setPushing] = useState(false)
  const [pushSummary, setPushSummary] = useState<{ total: number; submitted: number; failed: number } | null>(null)

  const [hsnForm, setHsnForm] = useState({ hsnCode: '', gstRate: '', category: '', description: '' })
  const [savingHsn, setSavingHsn] = useState(false)

  const { data: meData } = useSWR('/api/auth/me')
  useEffect(() => {
    if (meData?.success) {
      const found = meData.businesses?.find((b: any) => b._id === meData.user?.activeBusinessId) || meData.businesses?.[0]
      if (found) setBusinessId(found._id)
    }
  }, [meData])

  const { data: businessRes } = useSWR(businessId ? `/api/businesses/${businessId}` : null)
  const business = businessRes?.success ? businessRes.business : null

  const { data: filingsRes, isLoading: loadingFilings, mutate: refetchFilings } = useSWR(
    businessId && tab === 'filings' ? `/api/gst/filings?businessId=${businessId}` : null
  )
  const filings: Filing[] = filingsRes?.success ? filingsRes.data : []

  const { data: configRes, mutate: refetchConfig } = useSWR(
    businessId && tab === 'config' ? `/api/gst/config?businessId=${businessId}` : null
  )
  const config = configRes?.success ? configRes.data : null

  const { data: hsnRes, isLoading: loadingHsn, mutate: refetchHsn } = useSWR(
    businessId && tab === 'hsn' ? `/api/hsn-tax-rates?businessId=${businessId}` : null
  )
  const hsnRates: HsnRate[] = hsnRes?.success ? (hsnRes.rates || []) : []

  useEffect(() => {
    if (config) {
      setGstin(config.gstin || '')
      setProvider(config.provider || 'NONE')
      setIsEnabled(!!config.isEnabled)
      setAutoSubmit(!!config.autoSubmit)
    }
  }, [config])

  async function addHsnRate(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    setSavingHsn(true)
    setMsg('')
    try {
      const res = await fetch('/api/hsn-tax-rates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessId,
          hsnCode: hsnForm.hsnCode.trim(),
          gstRate: Number(hsnForm.gstRate),
          category: hsnForm.category.trim(),
          description: hsnForm.description.trim(),
        }),
      })
      const d = await res.json()
      if (!d.success) {
        setMsg(d.error || 'Failed to save HSN mapping')
        return
      }
      setHsnForm({ hsnCode: '', gstRate: '', category: '', description: '' })
      refetchHsn()
    } catch {
      setMsg('Failed to save HSN mapping')
    } finally {
      setSavingHsn(false)
    }
  }

  async function deleteHsnRate(id: string) {
    await fetch(`/api/hsn-tax-rates/${id}`, { method: 'DELETE', credentials: 'include' })
    refetchHsn()
  }

  async function pushRange(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    setPushing(true)
    setMsg('')
    setPushSummary(null)
    try {
      const period = pushFrom.slice(0, 7).split('-').reverse().join('-') // "MM-YYYY" from "YYYY-MM-DD"
      const res = await fetch('/api/gst/push-range', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessId, from: pushFrom, to: pushTo, returnType: pushReturnType, period }),
      })
      const d = await res.json()
      if (d.success) {
        setPushSummary(d.summary)
        setMsg(`Pushed ${d.summary.submitted}/${d.summary.total} invoices. ${d.summary.failed} failed.`)
      } else {
        setMsg(d.error || 'Push failed')
      }
    } catch {
      setMsg('Push failed')
    }
    setPushing(false)
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    // Required before this business can push invoices it handled itself --
    // the portal push needs a real GSTIN, and enabling it with a blank one
    // would just fail silently at push time instead of here.
    if (!gstin.trim()) {
      setMsg('GSTIN is required before saving GST settings.')
      return
    }
    setSavingConfig(true)
    setMsg('')
    try {
      const res = await fetch('/api/gst/config', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessId, gstin, provider, isEnabled, autoSubmit,
          ...(apiKey ? { apiKey } : {}),
          ...(apiSecret ? { apiSecret } : {}),
        }),
      })
      const d = await res.json()
      setMsg(d.success ? 'Saved.' : d.error || 'Failed to save')
      if (d.success) { setApiKey(''); setApiSecret(''); refetchConfig() }
    } catch {
      setMsg('Failed to save')
    }
    setSavingConfig(false)
  }

  async function submitFiling(id: string) {
    setSubmittingId(id)
    try {
      const res = await fetch(`/api/gst/filings/${id}/submit`, { method: 'POST', credentials: 'include' })
      const d = await res.json()
      setMsg(d.success ? 'Filing submitted.' : d.error || 'Submission failed')
      refetchFilings()
    } catch {
      setMsg('Submission failed')
    }
    setSubmittingId(null)
  }

  function statusBadge(status: string) {
    const map: Record<string, { color: string; icon: any }> = {
      PENDING: { color: 'text-amber-300 border-amber-400/30 bg-amber-400/10', icon: Clock },
      SUBMITTED: { color: 'text-cyan-300 border-cyan-400/30 bg-cyan-400/10', icon: Send },
      ACCEPTED: { color: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10', icon: CheckCircle2 },
      REJECTED: { color: 'text-red-300 border-red-400/30 bg-red-400/10', icon: AlertCircle },
      FAILED: { color: 'text-red-300 border-red-400/30 bg-red-400/10', icon: AlertCircle },
    }
    const cfg = map[status] || map.PENDING
    const Icon = cfg.icon
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.color}`}>
        <Icon className="h-3.5 w-3.5" /> {status}
      </span>
    )
  }

  return (
      <div className="space-y-8">
        <section className="rounded-[40px] border border-white/10 bg-white/5 p-10">
          <p className="uppercase tracking-[0.35em] text-cyan-300 text-sm">COMPLIANCE</p>
          <h1 className="mt-5 text-6xl font-black flex items-center gap-4">
            <Landmark className="h-12 w-12" /> GST Filing
          </h1>
          <p className="mt-4 max-w-2xl text-white/60">
            Push sales invoices to the GST portal and track filing status. ANu can help you understand what's pending — ask it in AI Workspace.
          </p>
          {business && (
            <div className="mt-6 flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-white/40 uppercase tracking-wider text-xs">GSTIN</p>
                <p className="font-semibold mt-1">{business.compliance?.gstNumber || 'Not set on Business profile'}</p>
              </div>
              <div>
                <p className="text-white/40 uppercase tracking-wider text-xs">Filing Cycle</p>
                <p className="font-semibold mt-1">{business.compliance?.filingCycle || business.financial?.filingCycle || 'Monthly (default)'}</p>
              </div>
            </div>
          )}
        </section>

        <div className="flex gap-3">
          {(['push', 'filings', 'hsn', 'config'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
                tab === t ? 'bg-cyan-400 text-black' : 'border border-white/10 text-white/60 hover:text-white'
              }`}
            >
              {t === 'push' ? 'Push Invoices' : t === 'filings' ? 'Filings' : t === 'hsn' ? 'HSN Mapping' : 'Settings'}
            </button>
          ))}
        </div>

        {msg && <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm">{msg}</div>}

        {tab === 'push' && (
          <section className="rounded-[32px] border border-white/10 bg-white/5 p-8">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2"><Send className="h-6 w-6" /> Push Invoices to GST</h2>
            <p className="text-white/50 text-sm mb-6">
              Pick a date range — every sales invoice issued in that window gets queued and submitted to your
              configured GSP in one action. Invoices that already have an accepted filing are skipped.
            </p>
            <form onSubmit={pushRange} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end max-w-3xl">
              <div>
                <label className="text-sm text-white/60">From</label>
                <input type="date" value={pushFrom} onChange={(e) => setPushFrom(e.target.value)} required
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5" />
              </div>
              <div>
                <label className="text-sm text-white/60">To</label>
                <input type="date" value={pushTo} onChange={(e) => setPushTo(e.target.value)} required
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5" />
              </div>
              <div>
                <label className="text-sm text-white/60">Return Type</label>
                <select value={pushReturnType} onChange={(e) => setPushReturnType(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5">
                  <option value="GSTR1">GSTR-1</option>
                  <option value="GSTR3B">GSTR-3B</option>
                  <option value="IFF">IFF</option>
                </select>
              </div>
              <button disabled={pushing} type="submit"
                className="rounded-full bg-cyan-400 px-6 py-2.5 font-semibold text-black disabled:opacity-50 h-fit">
                {pushing ? 'Pushing...' : 'Push to GST'}
              </button>
            </form>
            {pushSummary && (
              <div className="mt-6 flex gap-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3">
                  <p className="text-2xl font-bold">{pushSummary.total}</p>
                  <p className="text-xs text-white/50">Total</p>
                </div>
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-5 py-3">
                  <p className="text-2xl font-bold text-emerald-300">{pushSummary.submitted}</p>
                  <p className="text-xs text-white/50">Submitted</p>
                </div>
                <div className="rounded-2xl border border-red-400/20 bg-red-400/5 px-5 py-3">
                  <p className="text-2xl font-bold text-red-300">{pushSummary.failed}</p>
                  <p className="text-xs text-white/50">Failed</p>
                </div>
              </div>
            )}
            <p className="mt-6 text-xs text-white/40">
              Failures typically mean no GSP is configured yet — add GSTIN + client credentials under the
              Settings tab. Check the Filings tab for per-invoice status and rejection reasons.
            </p>
          </section>
        )}

        {tab === 'filings' && (
          <section className="rounded-[32px] border border-white/10 bg-white/5 p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Filings</h2>
              <button onClick={() => refetchFilings()} className="flex items-center gap-2 text-sm text-white/60 hover:text-white">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
            {loadingFilings ? (
              <p className="text-white/40">Loading...</p>
            ) : filings.length === 0 ? (
              <p className="text-white/40">No filings queued yet. Filings are created from a sales invoice's detail page.</p>
            ) : (
              <div className="space-y-3">
                {filings.map((f: Filing) => (
                  <div key={f._id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-6 py-4">
                    <div>
                      <p className="font-semibold">{f.invoiceNumber}</p>
                      <p className="text-sm text-white/50">{f.returnType} · {f.period}</p>
                      {f.rejectionReason && <p className="text-sm text-red-300 mt-1">{f.rejectionReason}</p>}
                    </div>
                    <div className="flex items-center gap-4">
                      {statusBadge(f.status)}
                      {(f.status === 'PENDING' || f.status === 'FAILED') && (
                        <button
                          onClick={() => submitFiling(f._id)}
                          disabled={submittingId === f._id}
                          className="rounded-full bg-cyan-400 px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
                        >
                          {submittingId === f._id ? 'Submitting...' : 'Submit'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'hsn' && (
          <section className="rounded-[32px] border border-white/10 bg-white/5 p-8">
            <h2 className="text-2xl font-bold mb-2">HSN / Category / GST% Mapping</h2>
            <p className="text-white/50 text-sm mb-6">
              Business-specific rows override the global defaults for the same HSN code. Global/default rows are
              read-only here.
            </p>

            <form onSubmit={addHsnRate} className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end max-w-4xl mb-8">
              <div>
                <label className="text-sm text-white/60">HSN Code</label>
                <input required value={hsnForm.hsnCode} onChange={(e) => setHsnForm((p) => ({ ...p, hsnCode: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5" />
              </div>
              <div>
                <label className="text-sm text-white/60">GST %</label>
                <input required type="number" step="0.01" value={hsnForm.gstRate} onChange={(e) => setHsnForm((p) => ({ ...p, gstRate: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5" />
              </div>
              <div>
                <label className="text-sm text-white/60">Category</label>
                <input value={hsnForm.category} onChange={(e) => setHsnForm((p) => ({ ...p, category: e.target.value }))}
                  placeholder="Goods / Services" className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5" />
              </div>
              <div>
                <label className="text-sm text-white/60">Description</label>
                <input value={hsnForm.description} onChange={(e) => setHsnForm((p) => ({ ...p, description: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5" />
              </div>
              <button disabled={savingHsn} type="submit"
                className="rounded-full bg-cyan-400 px-6 py-2.5 font-semibold text-black disabled:opacity-50 h-fit">
                {savingHsn ? 'Saving...' : 'Add / Update'}
              </button>
            </form>

            {loadingHsn ? (
              <p className="text-white/40">Loading...</p>
            ) : hsnRates.length === 0 ? (
              <p className="text-white/40">No HSN mappings yet.</p>
            ) : (
              <div className="space-y-2">
                {hsnRates.map((r) => (
                  <div key={r._id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-6 py-3">
                    <div className="flex items-center gap-6">
                      <span className="font-mono text-sm">{r.hsnCode}</span>
                      <span className="text-sm text-white/60">{r.category || '—'}</span>
                      <span className="text-sm text-white/60">{r.description || '—'}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold">{r.gstRate}%</span>
                      {r.businessId ? (
                        <button onClick={() => deleteHsnRate(r._id)} className="text-xs text-red-300 hover:underline">Delete</button>
                      ) : (
                        <span className="text-xs text-white/30">Global default</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'config' && (
          <section className="rounded-[32px] border border-white/10 bg-white/5 p-8">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><Settings2 className="h-6 w-6" /> Portal Settings</h2>
            <form onSubmit={saveConfig} className="space-y-5 max-w-xl">
              <div>
                <label className="text-sm text-white/60">GSTIN</label>
                <input value={gstin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGstin(e.target.value)} required
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5" />
              </div>
              <div>
                <label className="text-sm text-white/60">Provider</label>
                <select value={provider} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProvider(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5">
                  <option value="NONE">Not configured</option>
                  <option value="GSTN_DIRECT">GSTN Direct</option>
                  <option value="CLEARTAX">ClearTax</option>
                  <option value="MASTERS_INDIA">Masters India</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-white/60">Client ID (GSP API Key) {config?.apiKeySet && '(already set — leave blank to keep)'}</label>
                <input type="password" value={apiKey} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5" />
              </div>
              <div>
                <label className="text-sm text-white/60">Client Secret (GSP API Secret) {config?.apiSecretSet && '(already set — leave blank to keep)'}</label>
                <input type="password" value={apiSecret} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiSecret(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isEnabled} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsEnabled(e.target.checked)} /> Enable GST portal push
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={autoSubmit} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAutoSubmit(e.target.checked)} /> Auto-queue filing when an invoice is created
              </label>
              <button disabled={savingConfig} type="submit"
                className="rounded-full bg-cyan-400 px-6 py-2.5 font-semibold text-black disabled:opacity-50">
                {savingConfig ? 'Saving...' : 'Save'}
              </button>
            </form>
          </section>
        )}
      </div>
  )
}
