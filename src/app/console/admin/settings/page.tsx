'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Building2, Plug, Sparkles, Save, User, ChevronRight, Receipt, Globe2, Plus, Trash2, Send } from 'lucide-react'
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS } from '@/core/catalog/deviceCategory'
import DocumentNumbersPanel from '@/components/admin/DocumentNumbersPanel'
import TextFormatToolbar, { TELEGRAM_FORMAT_BUTTONS } from '@/components/shared/TextFormatToolbar'
import { EmojiPicker } from '@/components/ui/EmojiPicker'

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
  const [tab, setTab] = useState<Tab>('operations')
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
    bankAccountName: '',
    bankAccountNumber: '',
    bankIFSC: '',
    bankName: '',
    documentSignatureUrl: '',
    workorderTerms: '',
    serviceOrderTerms: '',
    estimateTerms: '',
    invoiceTerms: '',
    enabledDeviceCategories: [] as string[],
  })
  const [savingOperations, setSavingOperations] = useState(false)
  const [uploadingSignature, setUploadingSignature] = useState(false)
  const [signatureUploadError, setSignatureUploadError] = useState<string | null>(null)

  // Same Cloudinary pipeline the Businesses admin page already uses for
  // logo/favicon uploads (api/assets/upload) -- documentSignatureUrl
  // existed on the schema but had no upload UI anywhere until now.
  async function handleSignatureUpload(file: File) {
    setUploadingSignature(true)
    setSignatureUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', 'signature')
      fd.append('category', 'signature')
      const res = await fetch('/api/assets/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || data.message || 'Failed to upload signature')
      setOperations((p) => ({ ...p, documentSignatureUrl: data.asset?.fileUrl || '' }))
    } catch (err: any) {
      setSignatureUploadError(err?.message || 'Failed to upload signature')
    } finally {
      setUploadingSignature(false)
    }
  }

  const { data: meData } = useSWR('/api/auth/me')
  const isSuperAdmin = !!meData?.user?.isSuperAdmin
  const businessId: string | null = meData?.success
    ? (meData.businesses?.find((b: any) => b._id === meData.user?.activeBusinessId) || meData.businesses?.[0])?._id ?? null
    : null
  // Integrations and AI/ANu are being moved to Super-Admin-only,
  // configured centrally per business rather than by the business itself
  // -- per explicit direction ("Integrations remove from SC side and add
  // super admin only... AI/ANu config also from SC dashboard remove that
  // because there are super admin level"). Hidden here for SC in the
  // meantime; a Super Admin (view === 'platform') still isn't affected.
  const activeBiz = meData?.businesses?.find((b: any) => b._id === businessId) || meData?.businesses?.[0]
  const isSC = activeBiz?.operatingMode === 'SC'

  const { data: planStatus } = useSWR(
    view === 'business' && tab === 'integrations' ? '/api/subscriptions/status' : null
  )

  const { data: telegramBotInfo } = useSWR(
    view === 'business' && tab === 'integrations' ? '/api/telegram/bot-info' : null
  )
  const telegramBotUsername: string | null = telegramBotInfo?.success ? telegramBotInfo.username : null

  const hasTelegramReportFeature: boolean = Array.isArray(planStatus?.moduleKeys)
    ? planStatus.moduleKeys.includes('telegram-reports')
    : true // unknown allowlist (null) means "not gated" -- don't block on a load error

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
    businessId && view === 'business' && (tab === 'operations' || tab === 'integrations') ? `/api/businesses/${businessId}` : null
  )
  useEffect(() => {
    if (operationsRes?.success && operationsRes.business) {
      const b = operationsRes.business
      setOperations({
        inventorySerialized: !!b.inventorySerialized,
        applyTaxOnB2CBilling: b.applyTaxOnB2CBilling !== false,
        defaultLabourCharge: b.defaultLabourCharge || 0,
        upiId: b.upiId || '',
        bankAccountName: b.bankAccountName || '',
        bankAccountNumber: b.bankAccountNumber || '',
        bankIFSC: b.bankIFSC || '',
        bankName: b.bankName || '',
        documentSignatureUrl: b.documentSignatureUrl || '',
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

  // Vendor SELF-service Telegram routing -- this settings page is always
  // the caller's OWN business (never staff managing someone else's, that's
  // the separate console/admin/vendors/[id]/telegram page), so it must use
  // /api/vendor/telegram-routing (resolves the business from the caller's
  // own session) rather than /api/businesses/[id]/telegram-routing (staff-
  // only, requires a "vendors.edit" permission a vendor's own account
  // never holds). Using the staff-only route here meant this GET silently
  // 401'd for every non-staff caller and the page just showed an empty
  // alert-routing list with no explanation -- the actual root cause of
  // that report, distinct from the /vendor/telegram page's matching bug
  // (see that route's own comment).
  const { data: notifRes, mutate: refetchNotif } = useSWR(
    businessId && view === 'business' && tab === 'integrations' ? '/api/vendor/telegram-routing' : null
  )
  const [notifGroupChatId, setNotifGroupChatId] = useState('')
  const [notifPersonalChatId, setNotifPersonalChatId] = useState('')
  const [notifRouting, setNotifRouting] = useState<Record<string, { group: boolean; personal: boolean }>>({})
  // The report's own schedule -- moved here (VendorProfile, via this same
  // vendor-routing endpoint) from the stale operations.telegramReportFrequency
  // below, which wrote to Business.telegramReportFrequency, a field nothing
  // has read since the report moved to VendorProfile (see
  // resolveVendorChatConfig.ts) -- that control saved successfully but
  // silently did nothing. telegramReportTime is new: api/cron/
  // telegram-business-reports checks it instead of just an hours-since-last
  // -send interval (a bot can't ask Telegram to deliver at a given time
  // itself, so this is this app's own best-effort "send around HH:mm").
  const [notifReportFrequency, setNotifReportFrequency] = useState('NONE')
  const [notifReportTime, setNotifReportTime] = useState('09:00')
  const [savingNotif, setSavingNotif] = useState(false)
  useEffect(() => {
    if (notifRes?.success) {
      setNotifGroupChatId(notifRes.telegramChatId || '')
      setNotifPersonalChatId(notifRes.telegramPersonalChatId || '')
      setNotifRouting(notifRes.telegramMessageRouting || {})
      setNotifReportFrequency(notifRes.telegramReportFrequency || 'NONE')
      setNotifReportTime(notifRes.telegramReportTime || '09:00')
    }
  }, [notifRes])
  async function saveNotificationRouting() {
    if (!businessId) return
    setSavingNotif(true)
    try {
      await fetch('/api/vendor/telegram-routing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramChatId: notifGroupChatId,
          telegramPersonalChatId: notifPersonalChatId,
          telegramMessageRouting: notifRouting,
          telegramReportFrequency: notifReportFrequency,
          telegramReportTime: notifReportTime,
        }),
      })
      refetchNotif()
    } finally {
      setSavingNotif(false)
    }
  }

  const { data: integrationsRes, isLoading: loadingIntegrations } = useSWR(
    businessId && view === 'business' && tab === 'integrations' && isSuperAdmin ? `/api/integrations?businessId=${businessId}` : null
  )

  // Super-admin-only message TEXT + enabled/disabled editor per alert type --
  // applies platform-wide to every vendor's alert of that type (see
  // api/admin/telegram-templates and core/telegram/sendVendorTelegramMessage's
  // rendering step). Lives under Platform (AN Group) view now, not the
  // per-business Integrations tab -- a super admin has no "active vendor"
  // of their own, so nesting platform-wide message wording inside a
  // business-scoped tab made no sense ("there is no active vendor there
  // for super admin, it should be directly configurable only"). A vendor's
  // own Integrations tab never fetches this -- they only get the
  // Group/Personal routing checkboxes.
  const [templateChannel, setTemplateChannel] = useState<'TELEGRAM' | 'WHATSAPP'>('TELEGRAM')
  const { data: templatesRes, mutate: refetchTemplates } = useSWR(
    isSuperAdmin && view === 'platform' ? `/api/admin/telegram-templates?channel=${templateChannel}` : null
  )
  const [expandedTemplateKey, setExpandedTemplateKey] = useState<string | null>(null)
  const templateTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, string>>({})
  const [enabledDrafts, setEnabledDrafts] = useState<Record<string, boolean>>({})
  const [savingTemplateKey, setSavingTemplateKey] = useState<string | null>(null)
  // Card-style presentation drafts (icon/layout/footer tone+text) -- on top
  // of the plain wording above, see models/TelegramMessageTemplate.ts and
  // core/telegram/renderCard.ts's applyCardStyle.
  const [styleDrafts, setStyleDrafts] = useState<Record<string, { icon?: string; layout?: string; footerTone?: string; footerText?: string }>>({})
  function styleFor(t: any) {
    return {
      icon: styleDrafts[t.key]?.icon ?? t.icon ?? '',
      layout: styleDrafts[t.key]?.layout ?? t.layout ?? 'FLAT',
      footerTone: styleDrafts[t.key]?.footerTone ?? t.footerTone ?? 'NONE',
      footerText: styleDrafts[t.key]?.footerText ?? t.footerText ?? '',
    }
  }
  function setStyle(key: string, patch: Partial<{ icon: string; layout: string; footerTone: string; footerText: string }>) {
    setStyleDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }))
  }
  async function saveTemplate(key: string, enabledOverride?: boolean) {
    setSavingTemplateKey(key)
    try {
      const tmpl = templatesRes?.messageTypes?.find((x: any) => x.key === key)
      const enabled = enabledOverride ?? enabledDrafts[key] ?? tmpl?.enabled ?? true
      const style = styleFor(tmpl || {})
      await fetch('/api/admin/telegram-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, channel: templateChannel, template: templateDrafts[key] ?? tmpl?.template ?? '', enabled, ...style }),
      })
      refetchTemplates()
    } finally {
      setSavingTemplateKey(null)
    }
  }
  const FOOTER_TONE_OPTIONS = [
    { value: 'NONE', label: 'No footer' },
    { value: 'SUCCESS', label: '✅ Success' },
    { value: 'WARNING', label: '⚠️ Warning' },
    { value: 'DANGER', label: '❌ Danger' },
    { value: 'INFO', label: 'ℹ️ Info' },
  ]
  function previewHtml(t: any, style: { icon?: string; layout?: string; footerTone?: string; footerText?: string }) {
    const body = (templateDrafts[t.key] ?? t.template ?? '') || '<span class="text-ink-3">(built-in default wording)</span>'
    if (style.layout !== 'CARD') return body
    const toneEmoji: Record<string, string> = { SUCCESS: '✅', WARNING: '⚠️', DANGER: '❌', INFO: 'ℹ️', NONE: '' }
    const parts = [`<b>${style.icon ? `${style.icon} ` : ''}${t.label}</b>`, '', body]
    if (style.footerText) parts.push('', `${toneEmoji[style.footerTone || 'NONE'] ? `${toneEmoji[style.footerTone || 'NONE']} ` : ''}${style.footerText}`)
    return parts.join('\n')
  }
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

  // Integrations, Communication Quota, and AI/ANu are platform-level,
  // Super-Admin-only concerns -- not a vendor's own business settings,
  // regardless of vendor type (was previously only hidden for SC; Brand/
  // POS still saw them, which was the same "vendor-facing thing that's
  // actually a super-admin concern" gap this whole tab bar has already
  // been trimmed for once before).
  // Telegram config (chat ids, alert routing, report frequency) lives
  // entirely in the Integrations tab now -- it used to be split three ways
  // (Operations tab's chat-id field, a separate Notifications tab, and the
  // standalone /vendor/telegram page), which is exactly why it looked
  // broken/scattered. One tab, reachable by the business itself (not
  // Super-Admin-only like the rest of this tab used to be -- a vendor
  // configuring their own Telegram chat is a business-level concern, not a
  // platform one), per explicit direction.
  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'operations', label: 'Operations', icon: <Building2 size={14} /> },
    { key: 'integrations', label: 'Integrations', icon: <Plug size={14} /> },
    { key: 'numbering', label: 'Document Numbers', icon: <Receipt size={14} /> },
    // Invoicing Rules is entirely a marketplace/Brand concept (the
    // dual-invoice B2B+B2C split and vendor cost basis for orders a
    // different vendor fulfills) -- SC has no vendor-fulfilled order flow
    // at all, so the tab itself, not just those two fields inside it, has
    // nothing relevant to an SC business. Reported live as still showing
    // even after the fields inside it were hidden.
    ...(!isSC ? [{ key: 'invoicing' as Tab, label: 'Invoicing Rules', icon: <Receipt size={14} /> }] : []),
    ...(isSuperAdmin ? [{ key: 'communication' as Tab, label: 'Communication Quota', icon: <Globe2 size={14} /> }] : []),
    ...(isSuperAdmin ? [{ key: 'ai' as Tab, label: 'AI / ANu', icon: <Sparkles size={14} /> }] : []),
  ]

  return (
      <div className="space-y-5 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Admin</p>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          </div>
          <Link href="/console/admin/settings/account" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900">
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

            {(() => {
              const allTypes = templatesRes?.messageTypes || []
              const reportTypes = allTypes.filter((t: any) => t.isReport)
              const notificationTypes = allTypes.filter((t: any) => !t.isReport)

              const renderRow = (t: any) => {
                const expanded = expandedTemplateKey === t.key
                const isEnabled = enabledDrafts[t.key] ?? t.enabled ?? true
                const style = styleFor(t)
                return (
                  <div key={t.key} className="bg-surface">
                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {style.icon && <span className="mr-1">{style.icon}</span>}{t.label}
                        </p>
                        <p className="text-xs text-ink-3">{t.description}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <label className="flex items-center gap-1.5 text-xs text-ink-2">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(e) => {
                              const next = e.target.checked
                              setEnabledDrafts((d) => ({ ...d, [t.key]: next }))
                              saveTemplate(t.key, next)
                            }}
                          /> Enabled
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (!expanded) setTemplateDrafts((d) => ({ ...d, [t.key]: d[t.key] ?? t.template ?? '' }))
                            setExpandedTemplateKey(expanded ? null : t.key)
                          }}
                          className="text-xs font-medium text-accent hover:underline whitespace-nowrap"
                        >
                          {expanded ? 'Close' : 'Format Message'}
                        </button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="px-4 pb-4 bg-surface-2 border-t border-border">
                        <label className="text-xs text-ink-3 mb-1 block mt-3">
                          Message text (applies to every vendor for this alert type)
                        </label>
                        <TextFormatToolbar
                          buttons={TELEGRAM_FORMAT_BUTTONS}
                          textareaRef={templateTextareaRef}
                          onChange={(next) => setTemplateDrafts((d) => ({ ...d, [t.key]: next }))}
                        />
                        <textarea
                          ref={templateTextareaRef}
                          rows={3}
                          value={templateDrafts[t.key] ?? t.template ?? ''}
                          onChange={(e) => setTemplateDrafts((d) => ({ ...d, [t.key]: e.target.value }))}
                          placeholder="Leave blank to use the built-in default wording"
                          className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong font-mono"
                        />
                        <div className="flex items-center flex-wrap gap-1.5 mt-2">
                          <span className="text-xs text-ink-3">Tokens:</span>
                          {(t.tokens || []).map((tok: string) => (
                            <code
                              key={tok}
                              className="text-xs bg-surface border border-border rounded px-1.5 py-0.5 text-ink-2 cursor-pointer"
                              onClick={() => setTemplateDrafts((d) => ({ ...d, [t.key]: (d[t.key] ?? t.template ?? '') + `{{${tok}}}` }))}
                              title="Click to insert"
                            >
                              {`{{${tok}}}`}
                            </code>
                          ))}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div>
                            <label className="text-xs text-ink-3 mb-1 block">Icon</label>
                            <EmojiPicker value={style.icon} onChange={(emoji) => setStyle(t.key, { icon: emoji })} className="w-full" />
                          </div>
                          <div>
                            <label className="text-xs text-ink-3 mb-1 block">Layout</label>
                            <select
                              value={style.layout}
                              onChange={(e) => setStyle(t.key, { layout: e.target.value })}
                              className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-border-strong"
                            >
                              <option value="FLAT">Flat text</option>
                              <option value="CARD">Boxed card</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-ink-3 mb-1 block">Footer tone</label>
                            <select
                              value={style.footerTone}
                              onChange={(e) => setStyle(t.key, { footerTone: e.target.value })}
                              className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-border-strong"
                            >
                              {FOOTER_TONE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-ink-3 mb-1 block">Footer text</label>
                            <input
                              type="text"
                              value={style.footerText}
                              onChange={(e) => setStyle(t.key, { footerText: e.target.value })}
                              placeholder="e.g. {{vendorName}} confirmed"
                              className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-border-strong"
                            />
                          </div>
                        </div>

                        <div className="mt-2">
                          <span className="text-xs text-ink-3 block mb-1">Preview</span>
                          <div
                            className="rounded-control border border-dashed border-border bg-surface px-3 py-2 text-sm text-ink whitespace-pre-wrap"
                            // Telegram only ever renders this same narrow tag subset
                            // (b/i/u/s/code/a) -- safe to preview as literal HTML here
                            // since it's admin-authored text, not user-submitted.
                            dangerouslySetInnerHTML={{ __html: previewHtml(t, style) }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => saveTemplate(t.key)}
                          disabled={savingTemplateKey === t.key}
                          className="mt-3 text-xs font-medium bg-accent text-accent-fg rounded-control px-3 py-1.5 hover:bg-accent-hover disabled:opacity-50"
                        >
                          {savingTemplateKey === t.key ? 'Saving…' : 'Save Message'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              }

              return (
                <>
                  <div className="rounded-card border border-border bg-surface p-6">
                    <h3 className="h-section mb-1">Report Templates</h3>
                    <p className="text-xs text-ink-3 mb-4">
                      This app's own scheduled/on-demand Daily, Weekly, and Monthly business reports -- each one is
                      redesignable independently: its own icon, its own boxed-card layout, its own footer. Distinct
                      from the one-off event alerts below.
                    </p>
                    {!templatesRes ? (
                      <p className="text-sm text-ink-3">Loading…</p>
                    ) : (
                      <div className="divide-y divide-border rounded-control border border-border overflow-hidden">
                        {reportTypes.map(renderRow)}
                      </div>
                    )}
                  </div>

                  <div className="rounded-card border border-border bg-surface p-6">
                    <h3 className="h-section mb-1">Notification Templates</h3>
                    <p className="text-xs text-ink-3 mb-4">
                      Every automated one-off event alert the system can send, in one place -- no vendor context
                      needed. Write the wording once here and it's used for every vendor's alert of that type.
                      WhatsApp only actually sends once a business has its own WhatsApp Business API connected
                      (Integrations, per business); the template/on-off config here is ready either way so nothing
                      needs revisiting once that's added.
                    </p>
                    <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 w-fit mb-4">
                      {(['TELEGRAM', 'WHATSAPP'] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => { setTemplateChannel(c); setExpandedTemplateKey(null); setTemplateDrafts({}); setEnabledDrafts({}); setStyleDrafts({}) }}
                          className={`rounded-lg px-4 py-1.5 text-sm transition-all ${templateChannel === c ? 'bg-gray-900 text-white font-semibold' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                          {c === 'TELEGRAM' ? 'Telegram' : 'WhatsApp'}
                        </button>
                      ))}
                    </div>
                    {!templatesRes ? (
                      <p className="text-sm text-ink-3">Loading…</p>
                    ) : (
                      <div className="divide-y divide-border rounded-control border border-border overflow-hidden">
                        {notificationTypes.map(renderRow)}
                      </div>
                    )}
                  </div>
                </>
              )
            })()}

            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Other Platform Configuration</h3>
              <div className="space-y-2 text-sm">
                <Link href="/console/admin/roles" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-400 transition">
                  Roles &amp; Permissions <ChevronRight size={14} className="text-gray-400" />
                </Link>
                <Link href="/console/document-numbers" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-400 transition">
                  Document Numbers — "AN Group (Platform)" scope <ChevronRight size={14} className="text-gray-400" />
                </Link>
                <Link href="/console/admin/plan-features" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-400 transition">
                  Plan Features — module access per plan tier <ChevronRight size={14} className="text-gray-400" />
                </Link>
                <Link href="/console/admin/vendor-subscriptions" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-400 transition">
                  Vendor Subscriptions — plan status, payments, renewals <ChevronRight size={14} className="text-gray-400" />
                </Link>
                <Link href="/console/admin/telegram-ids" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-400 transition">
                  Telegram Chat IDs — bulk view/edit every vendor's linked chats, bot connectivity check <ChevronRight size={14} className="text-gray-400" />
                </Link>
                <Link href="/console/admin/telegram-notifications-log" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-400 transition">
                  Telegram/WhatsApp Notifications Log — every alert sent, success/fail <ChevronRight size={14} className="text-gray-400" />
                </Link>
                <Link href="/console/admin/email-templates" className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-400 transition">
                  Email Templates — subject/body per occasion <ChevronRight size={14} className="text-gray-400" />
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

        <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-center gap-2 text-sm text-gray-500">
          <Building2 size={14} /> Business profile (name, address, GST, logo) is managed centrally and no longer editable here.
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

              {/* Telegram (chat ids, alert routing, report frequency) moved
                  entirely to the Integrations tab -- see that tab's own
                  comment. */}

              <div className="pt-4 border-t border-border">
                <div className="text-sm font-medium text-ink mb-1">Bank Details</div>
                <div className="text-xs text-ink-3 mb-3">Shown on printed invoices as an alternative to (or alongside) the UPI QR code.</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-ink-3 mb-1 block">Account Holder Name</label>
                    <input type="text" value={operations.bankAccountName} onChange={(e) => setOperations({ ...operations, bankAccountName: e.target.value })}
                      className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong" />
                  </div>
                  <div>
                    <label className="text-xs text-ink-3 mb-1 block">Bank Name</label>
                    <input type="text" value={operations.bankName} onChange={(e) => setOperations({ ...operations, bankName: e.target.value })}
                      className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong" />
                  </div>
                  <div>
                    <label className="text-xs text-ink-3 mb-1 block">Account Number</label>
                    <input type="text" value={operations.bankAccountNumber} onChange={(e) => setOperations({ ...operations, bankAccountNumber: e.target.value })}
                      className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-ink-3 mb-1 block">IFSC Code</label>
                    <input type="text" value={operations.bankIFSC} onChange={(e) => setOperations({ ...operations, bankIFSC: e.target.value.toUpperCase() })}
                      className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong font-mono" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="text-sm font-medium text-ink mb-1">Signature</div>
                <div className="text-xs text-ink-3 mb-3">Shown on printed Invoice/Workorder/Service Record documents in the Authorized Signatory slot.</div>
                <div className="flex items-center gap-4">
                  {operations.documentSignatureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={operations.documentSignatureUrl} alt="Signature" className="h-14 w-40 object-contain border border-border rounded-control bg-surface-2" />
                  ) : (
                    <div className="h-14 w-40 flex items-center justify-center border border-dashed border-border rounded-control text-xs text-ink-3">No signature set</div>
                  )}
                  <label className="text-xs font-medium text-accent hover:underline cursor-pointer">
                    {uploadingSignature ? 'Uploading…' : 'Upload Signature'}
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingSignature} onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleSignatureUpload(file)
                    }} />
                  </label>
                  {operations.documentSignatureUrl && (
                    <button type="button" onClick={() => setOperations({ ...operations, documentSignatureUrl: '' })} className="text-xs text-danger hover:underline">Remove</button>
                  )}
                </div>
                {signatureUploadError && <p className="text-xs text-danger mt-1">{signatureUploadError}</p>}
              </div>

              {/* Device Types moved to the Brands & Models page (console/sc/
                  masters/brands) -- it's the top of the same Device
                  Category -> Brand -> Model hierarchy that page already
                  manages, not a generic business setting. */}

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
              {/* Dual-invoice (B2B leg from a fulfilling vendor + B2C leg to
                  the customer) and vendor cost basis are a marketplace/
                  Brand concept -- SC has no vendor-fulfilled order flow at
                  all, so neither field means anything for an SC business. */}
              {!isSC && (
                <>
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
                </>
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

        {/* Everything Telegram-related lives here now -- chat ids, which
            alert type goes to which chat, and the automatic report
            schedule. Used to be split across this Operations tab's own
            chat-id field, a separate Notifications tab, and the standalone
            /vendor/telegram page; consolidated into one place per explicit
            direction ("move that entire telegram related thing to
            telegram integrations tab only"). Reachable by the business
            itself, not Super-Admin-gated, since this is the caller's own
            Telegram setup. */}
        {tab === 'integrations' && (
          <div className="space-y-6">
            <div className="rounded-card border border-border bg-surface p-6">
              <h3 className="h-section mb-1">Telegram</h3>
              <p className="text-xs text-ink-3 mb-5">
                One bot serves every business -- link it to your own chat(s), then choose which alert types go
                where.
              </p>

              <div className="rounded-control border border-border bg-surface-2 p-4 mb-6">
                <p className="text-xs font-medium text-ink mb-1">Link with this business's Vendor ID</p>
                <p className="text-xs text-ink-3 mb-2">
                  Add the bot to the chat you want linked, then send{' '}
                  <span className="tabular font-medium text-ink">/link VND0001</span> (this business's own Vendor
                  ID, from Vendors &gt; this business's profile) there -- a group chat becomes the group
                  destination, a DM becomes the personal destination, automatically. No code to generate or copy.
                </p>
                {telegramBotUsername && (
                  <a
                    href={`https://t.me/${telegramBotUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
                  >
                    <Send className="w-3.5 h-3.5" /> Connect to Telegram Bot
                  </a>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-ink-3 mb-1.5">Group / Team Chat ID</label>
                  {isSuperAdmin ? (
                    <input
                      value={notifGroupChatId}
                      onChange={(e) => setNotifGroupChatId(e.target.value)}
                      placeholder="e.g. -1001234567890"
                      className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink"
                    />
                  ) : (
                    <>
                      <div className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-ink-3">
                        {notifGroupChatId || 'Not linked yet'}
                      </div>
                      <p className="text-xs text-ink-3 mt-1">
                        Set automatically when you message the bot with /link VND#### from the group or your
                        personal chat — message the bot again to relink.
                      </p>
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-3 mb-1.5">Your Personal Chat ID</label>
                  {isSuperAdmin ? (
                    <input
                      value={notifPersonalChatId}
                      onChange={(e) => setNotifPersonalChatId(e.target.value)}
                      placeholder="e.g. 987654321"
                      className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink"
                    />
                  ) : (
                    <>
                      <div className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-ink-3">
                        {notifPersonalChatId || 'Not linked yet'}
                      </div>
                      <p className="text-xs text-ink-3 mt-1">
                        Set automatically when you message the bot with /link VND#### from the group or your
                        personal chat — message the bot again to relink.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <label className="text-xs text-ink-3 mb-1 block">Automatic Business Report</label>
                {hasTelegramReportFeature ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={notifReportFrequency}
                      onChange={(e) => setNotifReportFrequency(e.target.value)}
                      className="flex-1 rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong"
                    >
                      <option value="NONE">Off</option>
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                    {notifReportFrequency !== 'NONE' && (
                      <input
                        type="time"
                        value={notifReportTime}
                        onChange={(e) => setNotifReportTime(e.target.value)}
                        className="rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong"
                      />
                    )}
                    <button
                      type="button"
                      onClick={saveNotificationRouting}
                      disabled={savingNotif}
                      className="text-xs font-medium bg-accent text-accent-fg rounded-control px-3 py-2 hover:bg-accent-hover disabled:opacity-50 whitespace-nowrap"
                    >
                      {savingNotif ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-ink-3">
                    Not available on your current plan — upgrade from Plan &amp; Billing to unlock automatic Telegram reports.
                  </div>
                )}
                <div className="text-xs text-ink-3 mt-1">
                  Sends a full business summary (revenue, workorders, a trend chart) to the chat(s) above, once per
                  {notifReportFrequency === 'WEEKLY' ? ' week' : notifReportFrequency === 'MONTHLY' ? ' month' : ' day'}
                  {notifReportFrequency !== 'NONE' ? ` around ${notifReportTime}` : ''}. Telegram bots can't schedule their
                  own sends, so this is a best-effort time, accurate to how often the report check itself runs.
                </div>
              </div>

              <p className="text-xs font-medium text-ink mb-1">Alert Routing</p>
              <p className="text-xs text-ink-3 mb-3">Choose which chat gets which type of alert.</p>
              {isSuperAdmin && (
                <p className="text-xs text-ink-3 mb-3">
                  Message wording and the on/off switch for each alert type are configured platform-wide under{' '}
                  <button type="button" onClick={() => setView('platform')} className="text-accent hover:underline font-medium">
                    Platform (AN Group) &gt; Telegram Notification Templates
                  </button>
                  , not per business.
                </p>
              )}
              <div className="divide-y divide-border rounded-control border border-border overflow-hidden mb-5">
                {(notifRes?.messageTypes || []).map((t: any) => {
                  const cur = notifRouting[t.key] || { group: t.defaultGroup, personal: t.defaultPersonal }
                  return (
                    <div key={t.key} className="bg-surface">
                      <div className="px-4 py-3 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-ink">{t.label}</p>
                          <p className="text-xs text-ink-3">{t.description}</p>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <label className="flex items-center gap-1.5 text-xs text-ink-2">
                            <input
                              type="checkbox"
                              checked={!!cur.group}
                              onChange={() => setNotifRouting((prev) => ({ ...prev, [t.key]: { ...cur, group: !cur.group } }))}
                            /> Group
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-ink-2">
                            <input
                              type="checkbox"
                              checked={!!cur.personal}
                              onChange={() => setNotifRouting((prev) => ({ ...prev, [t.key]: { ...cur, personal: !cur.personal } }))}
                            /> Personal
                          </label>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveNotificationRouting}
                  disabled={savingNotif}
                  className="btn-primary rounded-control px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <Save size={13} /> {savingNotif ? 'Saving…' : 'Save Chat IDs & Routing'}
                </button>
                <button
                  type="button"
                  onClick={(e) => saveOperations(e as unknown as React.FormEvent)}
                  disabled={savingOperations}
                  className="rounded-control border border-border-strong px-5 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
                >
                  {savingOperations ? 'Saving…' : 'Save Report Schedule'}
                </button>
              </div>
            </div>

            {isSuperAdmin && (
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-5">Notification Integrations (platform status)</h3>
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
                  </div>
                )}
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
