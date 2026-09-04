'use client'

import useSWR from 'swr'
import { useState } from 'react'
import {
  BookOpen, Users, Shield, Plug, LayoutTemplate, BarChart3,
  ChevronDown, ChevronRight, Lock, KeyRound, CreditCard,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * Super-admin-only system guide -- per explicit direction ("Add a help page
 * and write everything related to website entire guide book, and show this
 * to super admin only"). Static content, not a CMS -- kept as one file so
 * it's trivial to keep in sync with the actual architecture as it changes,
 * same "reuse what already works" bias as the rest of this app.
 *
 * Gate is a real check against session.isSuperAdmin (from /api/auth/me),
 * not just nav-hiding -- someone hitting /console/help directly without
 * being a super admin gets EmptyState, not the content, since nav
 * visibility alone is cosmetic (see sidebar-nav.ts's comment on this key).
 */

interface Section {
  id: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: React.ReactNode
}

const SECTIONS: Section[] = [
  {
    id: 'architecture',
    icon: Shield,
    title: 'How this fits together (central-api, AN-CRM, ANgroup)',
    body: (
      <div className="space-y-2 text-sm text-ink-2">
        <p>Three apps share one identity and config layer via <b>central-api</b> (api.angroup.in):</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>central-api</b> — the shared backend. Owns PlatformUser (SSO identity), shared integrations (Resend/SMS/WhatsApp/Anu AI/Telegram), agreement templates, the page registry, and role-catalog/allowedPages config.</li>
          <li><b>AN-CRM</b> (this app) — vendor/business CRM: workorders, sales, inventory, CRM calls, vendor onboarding.</li>
          <li><b>ANgroup</b> — the main site + ERP surface (production, purchase, HR, storefront/marketplace).</li>
        </ul>
        <p>Login is via SSO token exchange (<code>/api/auth/sso/token</code> → <code>/api/auth/sso/verify</code>) so one account works across all three. A local record (Business, VendorProfile, etc.) is linked to its central-api counterpart via a <code>sourceId</code> field — central-api mints its own <code>_id</code> on sync, the local app's own <code>_id</code> is preserved as <code>sourceId</code>.</p>
        <p>Every read from central-api is best-effort: if central-api is down or unreachable, the local app degrades gracefully (empty/null), it never crashes the caller. See <code>src/lib/centralApiRead.ts</code>'s own top comment for the full contract.</p>
      </div>
    ),
  },
  {
    id: 'integrations',
    icon: Plug,
    title: 'Integrations (Resend, SMS, WhatsApp, Telegram, Anu AI)',
    body: (
      <div className="space-y-2 text-sm text-ink-2">
        <p><b>Central-api is the ONLY source</b> for every integration credential across every AN Group site — no local per-business Integration/AIConfig fallback in any live send path. Configure them from central-api's admin dashboard (Sites & Access tab → "Shared integrations" panel), not from any per-app Settings/Integrations page.</p>
        <p><b>Two-tier resolution:</b> a platform-wide default (applies to every business) and an optional per-business override (one business gets its own key). Set an override from the same panel's "Per-business override" section — paste the business's central-api <code>_id</code> (from the Businesses tab), pick a provider, paste raw JSON matching that provider's config shape.</p>
        <p>Providers: <code>RESEND</code> (email), <code>SMS</code>, <code>WHATSAPP</code>, <code>TELEGRAM</code> (ops alerts + ecosystem notifications), <code>ANU_AI</code> (the AI assistant widget — anthropic/openai/google/openrouter).</p>
        <p>If central-api is unreachable, each sender falls back to that app's own env vars (e.g. <code>RESEND_API_KEY</code>) as a last resort only — never the primary source.</p>
      </div>
    ),
  },
  {
    id: 'vendors',
    icon: Users,
    title: 'Vendor types, onboarding, and login',
    body: (
      <div className="space-y-2 text-sm text-ink-2">
        <p>SC (Service Center) is the only vendor type this platform supports (<code>VendorProfile.appliedAs</code>) — single ID, no staff/team, single-screen workorder flow. BRAND and POS were removed; the field itself is kept (not renamed/removed) since existing records may still carry a legacy value.</p>
        <p>Access control is keyed on the logged-in user's own vendor type, never on <code>Business.operatingMode</code> (that would incorrectly apply one type's restrictions to everyone in a mixed business).</p>
        <p><b>Login:</b> a vendor's login ID is always their <b>Vendor ID</b> (e.g. <code>VND-2026-27-0003</code>), never their email. Email is for notifications only. Password is whatever they set on first login — a temporary password is emailed at activation with <code>mustChangePassword: true</code>, forcing a real password to be set before anything else is reachable.</p>
        <p><b>Instant trial:</b> a business can enable skip-approval signup (central-api's vendor-onboarding-config, "Access" tab) — a public signup at <code>/partner-signup</code> auto-activates on a 7-day trial with no admin step, agreement-signing optional (<code>skipAgreement</code>). Admins can also manually "Activate on Trial" from a vendor's profile page, or extend a trial period from there.</p>
        <p><b>Only one public signup link exists</b>: <code>/partner-signup</code> (the old <code>/vendor-apply</code> now redirects there).</p>
      </div>
    ),
  },
  {
    id: 'pages-access',
    icon: Lock,
    title: 'Page access: sidebar, module keys, and the page registry',
    body: (
      <div className="space-y-2 text-sm text-ink-2">
        <p>Three layers, each narrowing what a user can see, applied in this order:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li><b>Local permissions</b> — the standard User → UserRole → Role → Permission chain, checked per-API-route (<code>requirePermission</code>).</li>
          <li><b>Vendor-type module restriction</b> — for a vendor-type user (BRAND/SC/POS), the sidebar additionally restricts to whatever module keys central-api's <code>vendorTypeModules</code> config grants that type for that business (Access tab). Configure this per business, per type — no code change needed to add/remove a module for a given type. SC has a hardcoded safety-net default if nothing's configured yet; BRAND/POS have none (unrestricted until configured).</li>
          <li><b>Central-api role catalog's <code>allowedPages</code></b> — a separate, coarser admin-configured restriction on top of everything above, keyed by a business's own role names (not vendor type). Configure from central-api's role-catalog panel, picking from the page registry.</li>
        </ol>
        <p><b>Page registry</b> (central-api's <code>pageregistry</code> dataset): every literal page (route) in AN-CRM and ANgroup, kept in sync by <code>scripts/migratePageRegistryToCentral.ts</code> in each repo — re-run it after adding new pages so the registry (and therefore anything built on it, like role allowedPages pickers) stays complete. It walks the actual <code>src/app</code> file tree, not just the curated sidebar/module list, so nothing is missed.</p>
        <p>Nav-hiding is cosmetic only — a determined direct URL hit isn't blocked by sidebar filtering alone. Pages with real vendor-type-specific data models (like the SC workorder screen) additionally self-guard via <code>/api/vendor/type-context</code>.</p>
      </div>
    ),
  },
  {
    id: 'no-code',
    icon: LayoutTemplate,
    title: 'Building a page without writing code',
    body: (
      <div className="space-y-2 text-sm text-ink-2">
        <p><b>Module Builder</b> (<code>/console/module-builder</code>) — drag-and-drop designer for a brand-new data type: pick field types (text, number, select, date, currency, reference, etc.), reorder, save. Scope it platform-wide or to one business.</p>
        <p>The moment a module is saved, it gets a real working page automatically at <code>/console/modules/[key]</code> — full list + create/edit form, reading directly off the field layout you designed. No route, no component, no API route needs to be hand-written; <code>/api/modules/:key/records</code> handles CRUD generically.</p>
        <p>Use <code>/console/modules</code> to see, enable/disable, or delete any existing module (system or custom).</p>
      </div>
    ),
  },
  {
    id: 'reports',
    icon: BarChart3,
    title: 'Reports and charts without writing code',
    body: (
      <div className="space-y-2 text-sm text-ink-2">
        <p><b>Report Builder</b> (<code>/console/report-builder</code>) — pick a data source (CRM calls, workorders, invoices, vendors, customers), pick fields, filters, an optional group-by, and a chart type (table, bar, line, pie). Save it, run it any time.</p>
        <p>Allowed data sources and their fields are an explicit allowlist in <code>core/reports/dataSources.ts</code> — extending it to a new data source is the one piece that still needs a code change (by design: it controls exactly what's queryable, not arbitrary raw access).</p>
      </div>
    ),
  },
  {
    id: 'growth-analytics',
    icon: BarChart3,
    title: 'Tracking growth or decline (Growth Analytics)',
    body: (
      <div className="space-y-2 text-sm text-ink-2">
        <p><code>/console/admin/growth-analytics</code> has two halves: the top ("Current Vendor Base") is a LIVE read of every vendor's actual current state — total count, new signups this month, status breakdown (Applied/Active/Suspended/etc), billing status (No Plan/Unpaid/Active/Expired), plan mix (Starter/Pro/Ultimate, active subscriptions only), a 6-month signup trend bar chart, and two churn signals (subscriptions that lapsed unpaid in the last 30 days, and vendors an admin marked Suspended/Inactive/Rejected in the last 30 days).</p>
        <p>The bottom half is the commercial-FUNNEL view built from logged <code>AnalyticsEvent</code> records (pricing page views → trial signups → checkout → payment → renewal/upgrade), including the founding-vs-standard pricing split and trial-to-paid conversion rate. This only reflects events that happened AFTER event tracking was added, so a vendor created earlier won't show up here even though they do show up in the live snapshot above.</p>
        <p>This is AN Group's own supervision view — distinct from a vendor's own business analytics (<code>/vendor/analytics</code>, <code>/console/common/analytics</code>), which is about a VENDOR's revenue/workorders, not the platform's.</p>
      </div>
    ),
  },
  {
    id: 'reset-password',
    icon: KeyRound,
    title: 'Resetting a vendor\'s password',
    body: (
      <div className="space-y-2 text-sm text-ink-2">
        <p>Passwords are one-way hashed — nobody, including a super admin, can ever look up or recover a vendor's existing password. The only option is to set a NEW one.</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Go to <code>/console/admin/vendors</code>, search for the vendor by their <b>Vendor ID</b> (e.g. <code>VNDT001</code>) or company name, and open their profile.</li>
          <li>In the password-reset section of that page, click <b>"Generate temporary password"</b>.</li>
          <li>The new password is shown <b>once</b>, in that response only — copy it immediately and share it with the vendor securely (it is never logged or shown again, and their next login forces them to set their own).</li>
        </ol>
        <p>This calls <code>POST /api/admin/users/[id]/reset-password</code> — super-admin-only, and it always sets <code>mustChangePassword: true</code> so the temp password can't linger as a real one.</p>
        <p><b>Login ID reminder:</b> a vendor always logs in with their <b>Vendor ID</b> (never their email) — see the "Vendor types, onboarding, and login" section above.</p>
      </div>
    ),
  },
  {
    id: 'vendor-plans',
    icon: CreditCard,
    title: 'Assigning or changing a vendor\'s plan (Starter / Pro / Ultimate)',
    body: (
      <div className="space-y-2 text-sm text-ink-2">
        <p>A vendor's plan is tracked on their <code>VendorSubscription</code> record, managed at <code>/console/admin/vendor-subscriptions</code> — search/select the vendor, then edit its <b>plan</b> and <b>status</b> (Trial / Pending Payment / Active / Expired / Cancelled) directly. This is the manual override path for testing or support — a real customer's plan otherwise changes itself automatically when their Razorpay payment confirms (see <code>core/billing/activateVendorInvoice.ts</code>).</p>
        <p>The three SC plans and exactly what each one includes are defined in one place, <code>core/pricing/plans.ts</code> — that file's <code>features</code> array is the literal public marketing copy, and its <code>moduleKeys</code>/<code>vendorModuleKeys</code> arrays are what actually turns pages and API writes on/off for that plan. If the two ever look inconsistent for a vendor, that file is the source of truth to check first.</p>
        <p><b>Starter</b> is workorder + invoicing only: customer database, single-login workorders, job card/device intake, GST/non-GST invoicing, basic Telegram alerts. No UPI payment QR, no private Material/BOM price list, no saved Brand/Device-Model list (typing a brand/model on a workorder always works — only saving it to a reusable dropdown list is blocked), and no inventory tracking at all.</p>
        <p><b>Pro</b> adds: Quotations/Credit Notes/Debit Notes/Proforma Invoices/Delivery Challans/Credit Accounts, UPI payment QR, the Material/BOM price list, Brand/Device-Model list storage, Warehouses & Stock Transfers, inventory tracking, fault/symptom/solutions library, Custom Report Builder, Analytics.</p>
        <p><b>Ultimate</b> adds on top of Pro: Ledger Book, Profit &amp; Loss, Expense tracking (the "finance-advanced" module key), and unlimited sub-vendor/multi-center hierarchy under one login.</p>
        <p>Every plan-gated feature is enforced twice: once in the nav (so a lower plan simply doesn't see the menu item) and again at the actual API route via <code>vendorHasModule(businessId, vendorId, moduleKey)</code> (<code>core/access/vendorAccess.service.ts</code>) — so a lower-plan vendor can't bypass the boundary by hitting the URL/API directly. If a feature seems wrongly visible or wrongly blocked for a test account, check both the nav item's <code>modules</code> array and whether the relevant route calls <code>vendorHasModule</code>.</p>
      </div>
    ),
  },
]

export default function HelpPage() {
  const { data: meRes, isLoading } = useSWR('/api/auth/me')
  const isSuperAdmin = !!meRes?.user?.isSuperAdmin
  const [open, setOpen] = useState<Set<string>>(new Set(['architecture']))

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (isLoading) return <LoadingPanel label="Loading…" />

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-bg text-ink p-6">
        <PageHeader title="Help & System Guide" description="Documentation for how this platform is put together." />
        <EmptyState kind="empty" title="Super admin only" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Help & System Guide"
        description="How AN-CRM, central-api and ANgroup fit together — architecture, access control, and the no-code builders already available."
      />
      <div className="space-y-3 max-w-4xl">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const isOpen = open.has(s.id)
          return (
            <Card key={s.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(s.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-2"
              >
                <Icon className="w-4 h-4 text-accent shrink-0" />
                <span className="text-sm font-semibold text-ink flex-1">{s.title}</span>
                {isOpen ? <ChevronDown className="w-4 h-4 text-ink-3" /> : <ChevronRight className="w-4 h-4 text-ink-3" />}
              </button>
              {isOpen && (
                <CardBody className="pt-0 border-t border-border">
                  <div className="pt-4">{s.body}</div>
                </CardBody>
              )}
            </Card>
          )
        })}
      </div>
      <div className="mt-6 max-w-4xl">
        <Badge tone="info">This page documents current state — update it here whenever the architecture changes.</Badge>
      </div>
    </div>
  )
}
