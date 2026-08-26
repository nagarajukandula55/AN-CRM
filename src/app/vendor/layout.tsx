import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import VendorLogoutButton from '@/components/vendor/VendorLogoutButton'
import VendorSwitcher from '@/components/vendor/VendorSwitcher'
import TelegramRequiredBanner from '@/components/vendor/TelegramRequiredBanner'
import NotificationBell from '@/components/NotificationBell'
import ContactWidget from '@/components/ContactWidget'
import BrowserPushRegister from '@/components/shared/BrowserPushRegister'
import { connectDB } from '@/lib/mongodb'
import BusinessMember from '@/models/BusinessMember'
import VendorProfile from '@/models/VendorProfile'
import VendorSubscription from '@/models/VendorSubscription'
import { resolveOwnerOrManagerVendor, getVendorStaffAccessMap, getVendorAvailableModules } from '@/core/access/vendorAccess.service'
import { isVendorBlockedByExpiredTrial } from '@/lib/vendor/checkTrialAccess'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ShoppingBag,
  FileText,
  User,
  BarChart3,
  Building2,
  Warehouse,
  Boxes,
  Phone,
  ClipboardList,
  PackageCheck,
  ArrowLeftRight,
  Wrench,
  CreditCard,
  HandCoins,
  Store,
  Send,
  LifeBuoy,
  FileSignature,
  Truck,
  FilePlus2,
  FileMinus2,
  Receipt,
  Tag,
  Smartphone,
  TrendingUp,
  FileBarChart,
  PieChart,
} from 'lucide-react'
// Note: `Phone` icon import removed along with the Appointments nav entry below.

// NOTE: Product Bill of Materials is intentionally NOT a top-level nav
// item — that BOM is per-product (see /vendor/products/[id]/bom, already
// built and wired from each product's own detail page), not a flat
// vendor-wide list, so it belongs inside "My Products" rather than
// getting its own nav entry. Service Center BOM (the repair parts/
// labour/consumable price list workorders pick from) is a DIFFERENT,
// unrelated BOM -- see models/BOM.ts's own comment -- and
// DOES get a nav entry below, since it's genuinely vendor-wide, not
// scoped to one product.
//
// `modules`: which granted module keys make this nav item visible to a
// STAFF member (Owner/Manager always see everything; managerOnly items are
// theirs regardless of module grants). null = visible to every team member.
// `section`: groups nav items under a small header in the sidebar (see the
// render loop below) -- purely cosmetic grouping, doesn't affect gating.
// Order below matches the explicit layout requested: Workorders group,
// Billing group, Stock group, Reports group, Account group.
const navItems: { href: string; label: string; icon: any; modules: string[] | null; managerOnly?: boolean; section?: string }[] = [
  { href: '/vendor', label: 'Dashboard', icon: LayoutDashboard, modules: null },

  // CRM Overview is the Dashboard itself now (/vendor, above) -- no
  // separate nav entry, per explicit direction ("that should be the
  // dashboard not a separate option"). /vendor/crm still redirects there
  // for any existing link (e.g. the Engineer/CCO login redirect).
  { href: '/vendor/crm/jobsheets', label: 'Workorders', icon: ClipboardList, modules: ['crm_jobsheets', 'crm'], section: 'Workorders' },
  { href: '/vendor/service-bom', label: 'Service Center BOM', icon: Wrench, modules: ['crm_jobsheets', 'crm'], section: 'Workorders' },
  // Migrated from console/sc/masters/{brands,solutions} -- brands/models
  // via the same /api/vendor/saved-catalog the workorder form's quick-add
  // already writes to; solutions via /api/solutions, already vendorId-
  // isolated.
  { href: '/vendor/masters/brands', label: 'Brands & Models', icon: Tag, modules: ['crm_jobsheets', 'crm'], section: 'Workorders' },
  { href: '/vendor/masters/solutions', label: 'Solutions', icon: Smartphone, modules: ['crm_jobsheets', 'crm'], section: 'Workorders' },

  { href: '/vendor/statement', label: 'Financial Statement', icon: BarChart3, modules: ['finance'], section: 'Billing' },
  // Migrated from console/common/sales -- raising a GST/Non-GST sales
  // invoice directly to an end customer.
  { href: '/vendor/documents/sales-invoices', label: 'Sales Invoices', icon: Receipt, modules: ['finance'], section: 'Billing' },
  // Migrated from console/common/documents/* -- SalesDocumentManager is
  // already vendor-scoped (api/sales-documents), no console-only
  // hardcoding, reused as-is.
  { href: '/vendor/documents/quotations', label: 'Quotations', icon: FileSignature, modules: ['finance'], section: 'Billing' },
  { href: '/vendor/documents/credit-notes', label: 'Credit Notes', icon: FilePlus2, modules: ['finance'], section: 'Billing' },
  { href: '/vendor/documents/debit-notes', label: 'Debit Notes', icon: FileMinus2, modules: ['finance'], section: 'Billing' },
  { href: '/vendor/documents/proforma-invoices', label: 'Proforma Invoices', icon: Receipt, modules: ['finance'], section: 'Billing' },
  { href: '/vendor/credits', label: 'Credit Accounts', icon: HandCoins, modules: ['finance'], section: 'Billing' },
  // "Invoices & Payments" (the read-only B2B invoice AN Group bills the
  // vendor for module fees -- a different thing from Sales Invoices above)
  // and Sub-Vendors weren't in the requested layout at all -- kept, placed
  // in Billing/Account respectively, rather than silently dropped; flagged
  // separately for confirmation on whether they should stay.
  { href: '/vendor/invoices', label: 'Invoices & Payments', icon: FileText, modules: ['finance'], section: 'Billing' },

  { href: '/vendor/warehouses', label: 'Warehouses', icon: Warehouse, modules: ['warehouses'], section: 'Stock' },
  // Migrated from console/common/inventory -- distinct from Warehouses
  // (locations only): this is actual stock quantities per material per
  // warehouse. /api/inventory/items and /api/inventory/movements are now
  // vendorId-scoped.
  { href: '/vendor/inventory', label: 'Inventory', icon: Boxes, modules: ['inventory'], section: 'Stock' },
  { href: '/vendor/stock-transfers', label: 'Stock Transfers', icon: ArrowLeftRight, modules: ['stock_transfers'], section: 'Stock' },
  { href: '/vendor/documents/delivery-challans', label: 'Delivery Challans', icon: Truck, modules: ['finance'], section: 'Stock' },

  // Migrated from console/common/{analytics,reports,report-builder} --
  // api/analytics/* and api/reports/* are now all vendorId-scoped.
  { href: '/vendor/analytics', label: 'Analytics', icon: PieChart, modules: ['analytics'], section: 'Reports' },
  { href: '/vendor/reports', label: 'Reports', icon: FileBarChart, modules: ['reports'], section: 'Reports' },
  // Report Builder is a Pro+ differentiator (its own value -- slicing by
  // fault/symptom code -- needs the Pro+ fault/symptom library to be
  // worth anything anyway, see plans.ts's own comment) -- gated on
  // 'fault_codes' rather than 'reports' (which every tier already has)
  // since fault_codes is already the exact Basic-vs-Pro+ split line, with
  // no new module-key plumbing needed.
  { href: '/vendor/report-builder', label: 'Report Builder', icon: TrendingUp, modules: ['fault_codes'], section: 'Reports' },

  // Was labeled only "My Profile" -- this IS the vendor's settings page
  // (backed by /api/vendor/settings), already fully accessible to every
  // Owner/Manager (modules: null), but an Owner/Manager looking for
  // "Settings" specifically didn't recognize this as it and believed they
  // had no settings access at all.
  { href: '/vendor/profile', label: 'My Profile / Settings', icon: User, modules: null, section: 'Account' },
  { href: '/vendor/billing', label: 'Billing & Plan', icon: CreditCard, modules: null, section: 'Account' },
  { href: '/vendor/telegram', label: 'Telegram Alerts', icon: Send, modules: null, section: 'Account' },
  // Migrated from console/common/sub-vendors -- already fully vendor-
  // scoped (own component reads /api/vendor/type-context for the
  // caller's vendorId). Not module-gated -- gated instead by an admin-set
  // subVendorBilling.subVendorPlan toggle (api/vendors/[id]/sub-vendors),
  // now actually wired to require the Ultimate plan.
  { href: '/vendor/sub-vendors', label: 'Sub-Vendors', icon: Store, modules: null, managerOnly: true, section: 'Account' },
  { href: '/vendor/help', label: 'Help & Tutorials', icon: LifeBuoy, modules: null, section: 'Account' },
]

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const role = headersList.get('x-user-role')
  const userId = headersList.get('x-user-id')
  const userName = headersList.get('x-user-name') || 'Vendor'

  // role !== 'VENDOR' used to be the ONLY check here -- but that's
  // User.role, the old flat single-role field set at signup/login. It has
  // nothing to do with the newer vendor-team system (BusinessMember +
  // vendorId-scoped Role/UserRole, see api/vendor/staff/route.ts): a
  // super admin adding someone as a vendor's Owner/Manager/etc. through
  // that flow never touches User.role at all, so anyone whose account
  // originally registered as a plain customer (the default) got bounced
  // straight back to /login on every single /vendor/* page, no matter
  // what access they'd actually been granted -- this was the "repeatedly
  // redirecting to login" report. Now also allows in anyone with an
  // ACTIVE BusinessMember row tied to a real vendor (vendorId set), which
  // is what actually grants vendor-portal access today.
  let hasVendorTeamAccess = false
  let membership: any = null
  if (role !== 'VENDOR' && userId) {
    try {
      await connectDB()
      membership = await BusinessMember.findOne({
        userId,
        vendorId: { $ne: null },
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      }).lean()
      hasVendorTeamAccess = !!membership
    } catch {
      hasVendorTeamAccess = false
    }
  }

  if (role !== 'VENDOR' && !hasVendorTeamAccess) {
    redirect('/login')
  }

  // Instant-trial vendors (Business.ts's marketplace.skipVendorApproval ->
  // services/vendorActivation.service.ts's activateVendorWithTrial) get a
  // 7-day Subscription with no admin approval step. Once that trial runs
  // out with no paid plan behind it, block the WHOLE portal here -- this
  // layout wraps every /vendor/* page, so this is the one place that
  // covers all of them at once, same reasoning as the nav-filtering below.
  // Deliberately checked AFTER the login redirect above (a logged-out/non-
  // vendor caller should just hit /login, not a "trial expired" page).
  try {
    await connectDB()
    let vendorIdForTrialCheck: string | null = null
    if (role === 'VENDOR' && userId) {
      const owned = await VendorProfile.findOne({ userId, isDeleted: { $ne: true } }).select('_id').lean()
      vendorIdForTrialCheck = owned ? String((owned as any)._id) : null
    } else if (membership?.vendorId) {
      vendorIdForTrialCheck = String(membership.vendorId)
    }
    if (vendorIdForTrialCheck && (await isVendorBlockedByExpiredTrial(vendorIdForTrialCheck))) {
      return (
        <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface border border-border rounded-card shadow-card p-8 text-center space-y-3">
            <p className="eyebrow text-warning">Trial ended</p>
            <h1 className="h-page">Your free trial has ended</h1>
            <p className="text-sm text-ink-2">
              Your 7-day trial period is over and the vendor portal is now locked. Please
              contact the business you're partnered with to choose a paid plan and
              restore access.
            </p>
            <VendorLogoutButton />
          </div>
        </div>
      )
    }
  } catch {
    // On any resolution error, fail OPEN for this check specifically -- an
    // outage here must not lock out every vendor whose trial hasn't
    // actually expired; the existing per-route guards (resolveVendorContext)
    // still apply the same check on the API side regardless.
  }

  // Vendor identity for the sidebar header -- their own company name/code/
  // logo, and current plan, instead of a generic "Vendor Portal" label
  // (per explicit direction: "don't brand it as vendor portal... whatever
  // they seeing here should have vendor details like their name and their
  // code etc and also under portal active you show them which plan they
  // are in").
  let vendorIdentity: { companyName?: string; vendorCode?: string; logoUrl?: string; planName?: string } | null = null
  try {
    const ownVendorForIdentity =
      role === 'VENDOR' && userId
        ? await VendorProfile.findOne({ userId, isDeleted: { $ne: true } }).select('companyName vendorId logoUrl').lean()
        : membership?.vendorId
        ? await VendorProfile.findById(membership.vendorId).select('companyName vendorId logoUrl').lean()
        : null
    if (ownVendorForIdentity) {
      const sub = await VendorSubscription.findOne({ vendorId: (ownVendorForIdentity as any)._id })
        .select('planName planKey currentPeriodEnd')
        .lean()
      const planActive = !!(sub as any)?.currentPeriodEnd && new Date((sub as any).currentPeriodEnd).getTime() > Date.now()
      vendorIdentity = {
        companyName: (ownVendorForIdentity as any).companyName,
        vendorCode: (ownVendorForIdentity as any).vendorId,
        logoUrl: (ownVendorForIdentity as any).logoUrl,
        planName: planActive ? ((sub as any).planName || (sub as any).planKey) : null,
      }
    }
  } catch {
    // Best-effort -- sidebar just falls back to the logged-in user's own
    // name (userName) if this fails for any reason.
  }

  // Nav filtering by the member's actual granted access ("based on access
  // that user should get access privileges and accordingly... UI changes"):
  //  - the structural Owner (role === 'VENDOR' login, or VendorProfile
  //    match) and Managers see every item THAT BUSINESS HAS ENABLED
  //    (Business.modules[] deny-list, via getVendorAvailableModules --
  //    previously this branch was skipped entirely for Owner/Manager, so
  //    they always saw every nav item regardless of what was actually
  //    enabled for their business -- e.g. a vendor's Manager seeing
  //    Purchase Orders/GRN/Stock Transfers nav links even though those
  //    modules were never assigned/enabled for that business at all);
  //  - other staff only see items whose module set intersects BOTH what
  //    the vendor's Owner/Manager granted them from Team & Access AND
  //    what the business has enabled.
  let visibleItems = navItems
  try {
    // resolveOwnerOrManagerVendor also correctly resolves a true
    // structural Owner (role === 'VENDOR' login) via the VendorProfile
    // match, not just BusinessMember-based Managers -- so this single
    // call (and the businessId it returns) now covers both cases, where
    // previously the whole `role !== 'VENDOR'` gate above meant a
    // structural Owner login never ran ANY nav filtering at all.
    const ownerOrManagerVendor = await resolveOwnerOrManagerVendor(userId)
    const businessIdForModules = ownerOrManagerVendor?.businessId
      ? String(ownerOrManagerVendor.businessId)
      : membership?.businessId
      ? String(membership.businessId)
      : null

    if (ownerOrManagerVendor) {
      if (businessIdForModules) {
        const availableModules = await getVendorAvailableModules(
          businessIdForModules,
          (ownerOrManagerVendor as any).appliedAs,
          String((ownerOrManagerVendor as any)._id)
        )
        const availableKeys = new Set(availableModules.map((m) => m.key))
        visibleItems = navItems.filter((item) => item.modules === null || item.modules.some((m) => availableKeys.has(m)))
      }
      // No resolvable businessId at all (shouldn't happen for a real
      // Owner/Manager) -- fall through with the full, unfiltered navItems
      // rather than guessing.
    } else if (userId && membership?.vendorId) {
      const staffVendor = await VendorProfile.findById(membership.vendorId).select('appliedAs').lean<any>()
      const [accessMap, availableModules] = await Promise.all([
        getVendorStaffAccessMap(String(membership.vendorId), String(membership.businessId)),
        getVendorAvailableModules(String(membership.businessId), staffVendor?.appliedAs, String(membership.vendorId)),
      ])
      const availableKeys = new Set(availableModules.map((m) => m.key))
      const granted = new Set(accessMap[String(userId).toLowerCase()]?.modules || [])
      visibleItems = navItems.filter((item) => {
        if (item.managerOnly) return false
        if (item.modules === null) return true
        return item.modules.some((m) => granted.has(m) && availableKeys.has(m))
      })
    }
  } catch {
    // On any resolution error, fail CLOSED: only the always-visible items
    // (Dashboard, Profile) render, never the full menu.
    visibleItems = navItems.filter((item) => item.modules === null && !item.managerOnly)
  }

  // h-screen (not min-h-screen) locks this row to exactly the viewport
  // height -- min-h-screen let it grow with tall page content, which
  // dragged the sidebar's height along with it instead of keeping it
  // capped to the screen with its own independent scroll.
  return (
    <div className="flex h-screen bg-bg text-ink overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-surface border-r border-border flex flex-col h-full">
        {/* Brand -- this vendor's own identity (name/code/logo), not a
            generic "Vendor Portal" label. */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            {vendorIdentity?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vendorIdentity.logoUrl} alt="" className="h-8 w-8 rounded-control object-contain border border-border bg-surface" />
            ) : (
              <div className="h-8 w-8 rounded-control bg-accent-soft border border-accent/20 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-accent" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate max-w-[150px]">
                {vendorIdentity?.companyName || userName}
              </p>
              <p className="text-[10px] text-ink-3">{vendorIdentity?.vendorCode || 'Vendor Account'}</p>
            </div>
          </div>
          <VendorSwitcher />
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleItems.map((item, i) => (
            <div key={item.href}>
              {item.section && item.section !== visibleItems[i - 1]?.section && (
                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3 first:pt-1.5">
                  {item.section}
                </p>
              )}
              <Link
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink transition-all duration-150 text-sm group"
              >
                <item.icon className="h-4 w-4 flex-shrink-0 group-hover:text-accent transition-colors" />
                {item.label}
              </Link>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="rounded-control border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <p className="text-xs text-ink-2">Portal Active</p>
            </div>
            <p className="text-[10px] text-ink-3">
              {vendorIdentity?.planName ? `${vendorIdentity.planName} plan` : 'No active plan'}
            </p>
          </div>
          <VendorLogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        <TelegramRequiredBanner />
        <div className="p-4 lg:p-6 flex-1">{children}</div>
      </main>
      {/* ANu widget removed from the vendor portal per explicit direction --
          notifications now live in their own top-right bell (previously
          folded into ANu's showNotifications prop), and human contact
          (WhatsApp/Telegram) replaces the AI assistant as the floating
          bottom-right affordance. */}
      <NotificationBell />
      <ContactWidget />
      <BrowserPushRegister />
    </div>
  )
}
