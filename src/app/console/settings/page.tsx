'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Building2, Plug, Sparkles, Save, User, ChevronRight, Receipt, Globe2, Plus, Trash2 } from 'lucide-react'
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS } from '@/core/catalog/deviceCategory'
import DocumentNumbersPanel from '@/components/admin/DocumentNumbersPanel'

/**
 * Admin Settings hub — src/app/console/settings.
 *
 * The user asked for a "settings" module but explicitly said "you decide
 * what to put in it." Scoped to the things an ERP admin actually needs to
 * configure business-wide, reusing APIs that ALREADY EXIST and work rather
 * than inventing new backends for all of them:
 *   - Business Profile:      NEW PATCH /api/businesses/[id] (added alongside this page)
 *   - Integrations:          EXISTING /api/integrations (Telegram/WhatsApp/Slack/Email)
 *   - AI / ANu:              EXISTING /api/ai/providers (AIConfig — same config ANu itself reads)
 *
 * The OLD src/app/settings/page.tsx (personal profile/password/notification
 * prefs) is NOT deleted or merged in here — it's a genuinely different
 * concern (per-user account settings vs. per-business admin settings) and
 * was already fully working. It's moved to src/app/console/settings/account
 * and linked from the tab bar here so it isn't orphaned, per "don't miss
 * any feature."
 *
 * Document Numbering used to be a tab here (a simpler prefix/startFrom/
 * active-only editor) AND its own separate /console/document-numbers route
 * (the full-featured one, with separator/FY/template/token picker) at the
 * same time -- two independent editors for the same underlying config is
 * exactly the kind of drift that made it look like it "wasn't updating
 * properly." Both are gone now; the one canonical place is the Document
 * Numbering section on each business's own view page (admin/business/[id],
 * see components/admin/DocumentNumbersPanel.tsx), per explicit direction.
 */

type View = 'business' | 'platform'
type Tab = 'integrations' | 'ai' | 'invoicing' | 'operations' | 'communication' | 'numbering'

interface SsoMapping {
  _id: string
  urlPattern: string
  sourceLabel: string
  defaultRoleCode: string
  isActive: boolean
}

interface InvoicingRules {
  dualInvoiceMode: boolean
  vendorCostBasis: 'NET_PAYOUT' | 'GROSS_AMOUNT' | 'FIXED_MARGIN_PERCENT' | 'VENDOR_DECLARED'
  fixedMarginPercent: number
  defaultSupplyType: 'INTRASTATE' | 'INTERSTATE'
}

export default function AdminSettingsPage() {
  const [view, setView] = useState<View>('business')
  const [tab, setTab] = useState<Tab>('integrations')
  const [msg, setMsg] = useState('')

  // Platform (AN Group) -- SSO source mappings
  const [ssoForm, setSsoForm] = useState({ urlPattern: '', sourceLabel: '', defaultRoleCode: '' })
  const [savingSso, setSavingSso] = useState(false)

  // Invoicing rules (marketplace dual B2B/B2C invoice generation)
  const [invoicingRules, setInvoicingRules] = useState<InvoicingRules>({
    dualInvoiceMode: false,
    vendorCostBasis: 'NET_PAYOUT',
    fixedMarginPercent: 0,
    defaultSupplyType: 'INTRASTATE',
  })
  const [savingInvoicing, setSavingInvoicing] = useState(false)

  // Operations: inventory serialization, B2C tax toggle, default labour
  // charge, UPI payment QR ID -- all pre-existed on the Business model
  // (see models/Business.ts) but were never surfaced in Settings. See
  // explicit direction: "Bring that Inventory serialization and Tax
  // related and also Labour Charges related setting to this settings page".
  const [operations, setOperations] = useState({
    inventorySerialized: false,
    applyTaxOnB2CBilling: true,
    defaultLabourCharge: 0,
    upiId: '',
    workorderTerms: '',
    serviceOrderTerms: '',
    estimateTerms: '',
    invoiceTerms: '',
    enabledDeviceCategories: [] as string[],
  })
  const [savingOperations, setSavingOperations] = useState(false)

  const { data: meData } = useSWR('/api/auth/me')
  const isSuperAdmin = !!meData?.user?.isSuperAdmin
  const businessId: string | null = meData?.success
    ? (meData.businesses?.find((b: any) => b._id === meData.user?.activeBusinessId) || meData.businesses?.[0])?._id ?? null
    : null

  const { data: ssoRes, isLoading: loadingSso, mutate: loadSsoMappings } = useSWR(
    view === 'platform' ? '/api/admin/sso-sources' : null
  )
  const ssoMappings: SsoMapping[] = ssoRes?.success ? ssoRes.mappings || [] : []

  const { data: invoicingRes } = useSWR(
    businessId && view === 'business' && tab === 'invoicing' ? `/api/businesses/${businessId}` : null
  )
  useEffect(() => {
    if (invoicingRes?.success && invoicingRes.business?.invoicingRules) {
      setInvoicingRules({
        dualInvoiceMode: false,
        vendorCostBasis: 'NET_PAYOUT',
        fixedMarginPercent: 0,
        defaultSupplyType: 'INTRASTATE',
        ...invoicingRes.business.invoicingRules,
      })
    }
  }, [invoicingRes])

  const { data: operationsRes } = useSWR(
    businessId && view === 'business' && tab === 'operations' ? `/api/businesses/${businessId}` : null
  )
  useEffect(() => {
    if (operationsRes?.success && operationsRes.business) {
      const b = operationsRes.business
      setOperations({
        inventorySerialized: !!b.inventorySerialized,
        applyTaxOnB2CBilling: b.applyTaxOnB2CBilling !== false,
        defaultLabourCharge: b.defaultLabourCharge || 0,
        upiId: b.upiId || '',
        workorderTerms: b.workorderTerms || '',
        serviceOrderTerms: b.serviceOrderTerms || '',
        estimateTerms: b.estimateTerms || '',
        invoiceTerms: b.invoiceTerms || '',
        enabledDeviceCategories: b.enabledDeviceCategories || [],
      })
    }
  }, [operationsRes])

  const { data: quotaRes, isLoading: loadingQuota } = useSWR(
    view === 'business' && tab === 'communication' ? '/api/admin/communication-quota' : null
  )
  const quota = quotaRes?.success ? quotaRes.quota : null

  const { data: integrationsRes, isLoading: loadingIntegrations } = useSWR(
    businessId && view === 'business' && tab === 'integrations' ? `/api/integrations?businessId=${businessId}` : null
  )
  const integrations: Record<string, any> = (() => {
    if (!integrationsRes?.success) return {}
    const byProvider: Record<string, any> = {}
    for (const i of integrationsRes.integrations) byProvider[i.provider] = i
    return byProvider
  })()

  const { data: aiRes, isLoading: loadingAi } = useSWR(
    view === 'business' && tab === 'ai' ? '/api/ai/providers' : null,
    (url: string) =>
      fetch(url, {
        credentials: 'include',
        headers: businessId ? { 'x-active-business-id': businessId } : undefined,
      }).then((r) => r.json())
  )
  const aiConfig = aiRes?.success ? aiRes.config : null

  async function addSsoMapping(e: React.FormEvent) {
    e.preventDefault()
    setSavingSso(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/sso-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(ssoForm),
      })
      const d = await res.json()
      if (!d.success) {
        setMsg(d.error || 'Failed to save')
        return
      }
      setSsoForm({ urlPattern: '', sourceLabel: '', defaultRoleCode: '' })
      loadSsoMappings()
    } catch {
      setMsg('Failed to save')
    } finally {
      setSavingSso(false)
    }
  }

  async function toggleSsoActive(m: SsoMapping) {
    await fetch(`/api/admin/sso-sources/${m._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isActive: !m.isActive }),
    })
    loadSsoMappings()
  }

  async function deleteSsoMapping(id: string) {
    await fetch(`/api/admin/sso-sources/${id}`, { method: 'DELETE', credentials: 'include' })
    loadSsoMappings()
  }

  async function saveInvoicingRules(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    setSavingInvoicing(true)
    setMsg('')
    try {
      const res = await fetch(`/api/businesses/${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ invoicingRules }),
      })
      const d = await res.json()
      setMsg(d.success ? '✓ Invoicing rules updated' : d.message || 'Failed to save')
    } catch {
      setMsg('Failed to save')
    }
    setSavingInvoicing(false)
  }

  async function saveOperations(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    setSavingOperations(true)
    setMsg('')
    try {
      const res = await fetch(`/api/businesses/${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(operations),
      })
      const d = await res.json()
      setMsg(d.success ? '✓ Operations settings updated' : d.message || 'Failed to save')
    } catch {
      setMsg('Failed to save')
    }
    setSavingOperations(false)
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'operations', label: 'Operations', icon: <Building2 size={14} /> },
    { key: 'numbering', label: 'Document Numbers', icon: <Receipt size={14} /> },
    { key: 'invoicing', label: 'Invoicing Rules', icon: <Receipt size={14} /> },
    { key: 'integrations', label: 'Integrations', icon: <Plug size={14} /> },
    { key: 'communication', label: 'Communication Quota', icon: <Globe2 size={14} /> },
    { key: 'ai', label: 'AI / ANu', icon: <Sparkles size={14} /> },
  ]

  return (
      <div className="space-y-5 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Admin</p>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          </div>
          <Link href="/console/settings/account" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900">
            <User size={13} /> My Account Settings <ChevronRight size={13} />
          </Link>
        </div>

        {msg && (
          <div className={`rounded-xl px-4 py-3 text-sm ${msg.startsWith('✓') ? 'bg-green-500/10 border border-green-500/20 text-green-700' : 'bg-red-500/10 border border-red-500/20 text-red-700'}`}>
            {msg}
          </div>
        )}

        {isSuperAdmin && (
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 w-fit">
            {(['business', 'platform'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); setMsg('') }}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all ${view === v ? 'bg-gray-900 text-white font-semibold' : 'text-gray-500 hover:text-gray-900'}`}
              >
                {v === 'platform' && <Globe2 size={14} />}
                {v === 'business' ? 'This Business' : 'Platform (AN Group)'}
              </button>
            ))}
          </div>
        )}

        {view === 'platform' ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">SSO Registration Sources</h3>
              <p className="text-xs text-gray-500 mb-5">
                Maps a registering site's URL to the default role new accounts from that origin get (see
                /api/auth/register). Add a new storefront here without any code change.
              </p>
              <form onSubmit={addSsoMapping} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end mb-6">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">URL Pattern</label>
                  <input required value={ssoForm.urlPattern} onChange={(e) => setSsoForm((p) => ({ ...p, urlPattern: e.target.value }))}
                    placeholder="e.g. shopnative.in"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Source Label</label>
                  <input required value={ssoForm.sourceLabel} onChange={(e) => setSsoForm((p) => ({ ...p, sourceLabel: e.target.value }))}
                    placeholder="e.g. shopnative"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Default Role Code</label>
                  <input required value={ssoForm.defaultRoleCode} onChange={(e) => setSsoForm((p) => ({ ...p, defaultRoleCode: e.target.value }))}
                    placeholder="e.g. CUSTOMER_SHOPNATIVE"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400" />
                </div>
                <button type="submit" disabled={savingSso} className="btn-primary rounded-xl px-4 py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  <Plus size={14} /> {savingSso ? 'Saving…' : 'Add'}
                </button>
              </form>

              {loadingSso ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : ssoMappings.length === 0 ? (
                <p className="text-sm text-gray-400">No SSO source mappings yet.</p>
              ) : (
                <div className="space-y-2">
                  {ssoMappings.map((m) => (
                    <div key={m._id} className="rounded-xl border border-gray-200 p-3 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.urlPattern}</p>
                        <p className="text-xs text-gray-500">{m.sourceLabel} → {m.defaultRoleCode}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleSsoActive(m)}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.isActive ? 'text-emerald-600 bg-emerald-500/10' : 'text-gray-500 bg-gray-100'}`}
                        >
                          {m.isActive ? 'Active' : 'Inactive'}
                        </button>
                        <button onClick={() => deleteSsoMapping(m._id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Other Platform Configuration</h3>
              <div className="space-y-2 text-sm">
                <Link href="/console/roles" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-400 transition">
                  Roles &amp; Permissions <ChevronRight size={14} className="text-gray-400" />
                </Link>
                <Link href="/console/document-numbers" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-400 transition">
                  Document Numbers — "AN Group (Platform)" scope <ChevronRight size={14} className="text-gray-400" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
        <>
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setMsg('') }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all flex-1 justify-center whitespace-nowrap ${tab === t.key ? 'bg-gray-900 text-white font-semibold' : 'text-gray-500 hover:text-gray-900'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Building2 size={14} /> Business profile (name, address, GST, logo) is edited from the Businesses page only.
          </div>
          {businessId && (
            <Link href={`/console/business/${businessId}`} className="flex items-center gap-1.5 text-xs font-medium text-gray-900 hover:underline">
              Edit Business Profile <ChevronRight size={13} />
            </Link>
          )}
        </div>

        {tab === 'numbering' && businessId && (
          <div className="rounded-card border border-border bg-surface p-6">
            <h3 className="h-section mb-1">Document Numbers</h3>
            <p className="text-xs text-ink-3 mb-5">
              Set your own numbering series/format (prefix, financial year, sequence length, etc.) per document type -- Invoice, Quotation, Delivery Challan, Credit/Debit Note, and more.
            </p>
            <DocumentNumbersPanel businessId={businessId} />
          </div>
        )}

        {tab === 'operations' && (
          <div className="rounded-card border border-border bg-surface p-6">
            <h3 className="h-section mb-1">Operations</h3>
            <p className="text-xs text-ink-3 mb-5">
              How this business tracks stock, applies tax on plain B2C bills, and gets paid.
            </p>
            <form onSubmit={saveOperations} className="space-y-4">
              <label className="flex items-center gap-3 rounded-control border border-border px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={operations.inventorySerialized}
                  onChange={(e) => setOperations({ ...operations, inventorySerialized: e.target.checked })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="text-sm font-medium text-ink">Serialized inventory</div>
                  <div className="text-xs text-ink-3">
                    When on, every transaction must check and deduct real stock before it can go through. When
                    off, Inventory is hidden from the menu entirely and no stock check happens.
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 rounded-control border border-border px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={operations.applyTaxOnB2CBilling}
                  onChange={(e) => setOperations({ ...operations, applyTaxOnB2CBilling: e.target.checked })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="text-sm font-medium text-ink">Apply GST on B2C bills</div>
                  <div className="text-xs text-ink-3">
                    When off, a plain B2C bill (no company name) is generated with zero tax, on its own
                    non-GST number series. B2B invoices are never affected by this toggle.
                  </div>
                </div>
              </label>

              <div>
                <label className="text-xs text-ink-3 mb-1 block">Default labour charge</label>
                <input
                  type="number"
                  min={0}
                  value={operations.defaultLabourCharge}
                  onChange={(e) => setOperations({ ...operations, defaultLabourCharge: Number(e.target.value) })}
                  onFocus={(e) => e.target.select()}
                  placeholder="0"
                  className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong"
                />
                <div className="text-xs text-ink-3 mt-1">
                  Used for the one-click "Add Labour Charge" line on a workorder when no BOM labour entry exists.
                </div>
              </div>

              <div>
                <label className="text-xs text-ink-3 mb-1 block">UPI ID (for invoice payment QR)</label>
                <input
                  type="text"
                  value={operations.upiId}
                  onChange={(e) => setOperations({ ...operations, upiId: e.target.value })}
                  placeholder="business@okhdfcbank"
                  className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong"
                />
                <div className="text-xs text-ink-3 mt-1">
                  When set, every printed invoice shows a scannable UPI QR code for this business's own VPA.
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="text-sm font-medium text-ink mb-1">Device Types</div>
                <div className="text-xs text-ink-3 mb-3">
                  Narrows the workorder intake form's "Device Type" dropdown to just what this business services. Leave none checked to show every category.
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-2">
                  {DEVICE_CATEGORIES.map((c) => {
                    const checked = operations.enabledDeviceCategories.includes(c)
                    return (
                      <label key={c} className="flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setOperations({
                            ...operations,
                            enabledDeviceCategories: e.target.checked
                              ? [...operations.enabledDeviceCategories, c]
                              : operations.enabledDeviceCategories.filter((x) => x !== c),
                          })}
                          className="rounded border-border"
                        />
                        {DEVICE_CATEGORY_LABELS[c]}
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="text-sm font-medium text-ink mb-1">Terms &amp; Conditions</div>
                <div className="text-xs text-ink-3 mb-3">
                  Set separate terms per document type. Leave one blank to fall back to whatever the others say — nothing prints blank.
                </div>
                {([
                  { key: 'workorderTerms', label: 'Workorder' },
                  { key: 'serviceOrderTerms', label: 'Service Order' },
                  { key: 'estimateTerms', label: 'Estimate' },
                  { key: 'invoiceTerms', label: 'Invoice' },
                ] as const).map(({ key, label }) => (
                  <div key={key} className="mb-3">
                    <label className="text-xs text-ink-3 mb-1 block">{label} Terms</label>
                    <textarea
                      rows={3}
                      value={operations[key]}
                      onChange={(e) => setOperations({ ...operations, [key]: e.target.value })}
                      placeholder="Payment due within 30 days. Goods once sold..."
                      className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong resize-none"
                    />
                  </div>
                ))}
              </div>

              <button type="submit" disabled={savingOperations} className="btn-primary rounded-control px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
                <Save size={13} /> {savingOperations ? 'Saving…' : 'Save Operations'}
              </button>
            </form>
          </div>
        )}

        {tab === 'invoicing' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Marketplace Invoicing Rules</h3>
            <p className="text-xs text-gray-400 mb-5">
              Controls what happens when a customer order is fulfilled by a vendor. Off by default —
              vendor payouts are still settled normally (Vendor Settlements) either way.
            </p>
            <form onSubmit={saveInvoicingRules} className="space-y-4">
              <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={invoicingRules.dualInvoiceMode}
                  onChange={(e) => setInvoicingRules({ ...invoicingRules, dualInvoiceMode: e.target.checked })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">Generate dual invoices (B2B + B2C)</div>
                  <div className="text-xs text-gray-400">
                    When on: a B2B invoice is generated from the vendor to this business (at their cost basis
                    below), and a separate B2C invoice from this business to the customer (at the sale price),
                    for every order with vendor-fulfilled items.
                  </div>
                </div>
              </label>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Vendor cost basis (for the B2B leg)</label>
                <select
                  value={invoicingRules.vendorCostBasis}
                  onChange={(e) => setInvoicingRules({ ...invoicingRules, vendorCostBasis: e.target.value as InvoicingRules['vendorCostBasis'] })}
                  title="Vendor cost basis"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
                >
                  <option value="NET_PAYOUT">Net payout — sale value minus platform commission (matches Vendor Settlements)</option>
                  <option value="GROSS_AMOUNT">Gross amount — full sale value, no commission deducted</option>
                  <option value="FIXED_MARGIN_PERCENT">Fixed margin % — sale value reduced by a flat markup</option>
                  <option value="VENDOR_DECLARED">Vendor-declared price</option>
                </select>
              </div>

              {invoicingRules.vendorCostBasis === 'FIXED_MARGIN_PERCENT' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Fixed margin percent</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={invoicingRules.fixedMarginPercent}
                    onChange={(e) => setInvoicingRules({ ...invoicingRules, fixedMarginPercent: Number(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    placeholder="Fixed margin percent"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Default supply type (GST)</label>
                <select
                  value={invoicingRules.defaultSupplyType}
                  onChange={(e) => setInvoicingRules({ ...invoicingRules, defaultSupplyType: e.target.value as InvoicingRules['defaultSupplyType'] })}
                  title="Default supply type"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
                >
                  <option value="INTRASTATE">Intrastate (CGST + SGST)</option>
                  <option value="INTERSTATE">Interstate (IGST)</option>
                </select>
              </div>

              <button type="submit" disabled={savingInvoicing} className="btn-primary rounded-xl px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
                <Save size={13} /> {savingInvoicing ? 'Saving…' : 'Save Invoicing Rules'}
              </button>
            </form>
          </div>
        )}

        {tab === 'communication' && (
          <div className="rounded-card border border-border bg-surface p-6">
            <h3 className="h-section mb-1">Communication Quota</h3>
            <p className="text-xs text-ink-3 mb-5">
              Platform-sent email (via our Resend account, on your behalf) and WhatsApp (centrally
              subscribed) — a monthly allowance set by AN Group. Contact us to change your quota.
            </p>
            {loadingQuota ? (
              <p className="text-sm text-ink-3">Loading…</p>
            ) : quota ? (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-ink">Email</span>
                    <span className={`text-xs ${quota.emailEnabled ? 'text-success' : 'text-ink-3'}`}>
                      {quota.emailEnabled ? 'Enabled' : 'Not enabled'}
                    </span>
                  </div>
                  <div className="h-2 rounded-control bg-surface-2 overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${Math.min(100, (quota.emailUsed / (quota.emailQuota || 1)) * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-ink-3 mt-1">{quota.emailUsed} / {quota.emailQuota} sent this month</div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-ink">WhatsApp</span>
                    <span className={`text-xs ${quota.whatsappEnabled ? 'text-success' : 'text-ink-3'}`}>
                      {quota.whatsappEnabled ? 'Enabled' : 'Not enabled'}
                    </span>
                  </div>
                  <div className="h-2 rounded-control bg-surface-2 overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${Math.min(100, (quota.whatsappUsed / (quota.whatsappQuota || 1)) * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-ink-3 mt-1">{quota.whatsappUsed} / {quota.whatsappQuota} sent this month</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-3">No quota configured yet.</p>
            )}
          </div>
        )}

        {tab === 'integrations' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-5">Notification Integrations</h3>
            {loadingIntegrations ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <div className="space-y-3">
                {['TELEGRAM', 'WHATSAPP', 'SLACK', 'EMAIL'].map((provider) => (
                  <div key={provider} className="rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{provider}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {integrations[provider]?.isActive ? 'Connected' : 'Not configured'}
                      </p>
                    </div>
                    <span className={`h-2.5 w-2.5 rounded-full ${integrations[provider]?.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  </div>
                ))}
                <p className="text-xs text-gray-400 pt-2">
                  Full credential editing (bot tokens, webhook URLs) uses the existing /console/integrations screen — this view is a status summary.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'ai' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">AI / ANu Configuration</h3>
            <p className="text-xs text-gray-500 mb-5">
              ANu (the assistant reachable from the graduation-cap/bot icon on every admin page) uses whichever provider below is enabled, preferring Anthropic if both are set. This page is a status summary only — the previous copy here wrongly said "add a key here"; use the button below instead.
            </p>
            {loadingAi ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <div className="space-y-3">
                {aiConfig && ['anthropic', 'openai'].map((provider) => (
                  <div key={provider} className="rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 capitalize">{provider}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {aiConfig.providers[provider]?.apiKey ? `Key ${aiConfig.providers[provider].apiKey}` : 'No key configured'}
                      </p>
                    </div>
                    <span className={`h-2.5 w-2.5 rounded-full ${aiConfig.providers[provider]?.isEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  </div>
                ))}
                <a
                  href="/console/ai-image"
                  className="inline-flex items-center gap-1.5 mt-2 px-3 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
                >
                  Add / edit API keys in AI Studio
                </a>
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>
  )
}
