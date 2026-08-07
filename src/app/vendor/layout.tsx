import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import VendorLogoutButton from '@/components/vendor/VendorLogoutButton'
import AnuWidget from '@/components/AnuWidget'
import { connectDB } from '@/lib/mongodb'
import BusinessMember from '@/models/BusinessMember'
import VendorProfile from '@/models/VendorProfile'
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
  Wallet,
  Warehouse,
  Users,
  Boxes,
  Phone,
  ClipboardList,
  PackageCheck,
  ArrowLeftRight,
  Wrench,
  Layers,
  CreditCard,
  HandCoins,
  Store,
  Send,
} from 'lucide-react'

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
const navItems: { href: string; label: string; icon: any; modules: string[] | null; managerOnly?: boolean }[] = [
  { href: '/vendor', label: 'Dashboard', icon: LayoutDashboard, modules: null },
  { href: '/vendor/materials', label: 'Materials', icon: Layers, modules: ['materials'] },
  { href: '/vendor/warehouses', label: 'Warehouses', icon: Warehouse, modules: ['warehouses'] },
  // Service-center staff (CCO/Engineer/Centre Manager) already get
  // crm_calls/crm_jobsheets permissions via MEMBER_TYPE_IMPLIED_MODULES
  // (see vendor/staff/create/route.ts) but had no vendor-side page to use
  // them on -- only /console/crm existed, which isn't theirs to navigate
  // into. These reuse the exact same /api/crm/calls, /api/crm/jobsheets
  // endpoints, just scoped to this vendor's own team.
  { href: '/vendor/crm/calls', label: 'Appointments', icon: Phone, modules: ['crm_calls', 'crm'] },
  { href: '/vendor/crm/jobsheets', label: 'Workorders', icon: ClipboardList, modules: ['crm_jobsheets', 'crm'] },
  { href: '/vendor/service-bom', label: 'Service Center BOM', icon: Wrench, modules: ['crm_jobsheets', 'crm'] },
  { href: '/vendor/stock-transfers', label: 'Stock Transfers', icon: ArrowLeftRight, modules: ['stock_transfers'] },
  { href: '/vendor/staff', label: 'Staff', icon: Users, modules: ['staff'], managerOnly: true },
  { href: '/vendor/invoices', label: 'Invoices & Payments', icon: FileText, modules: ['finance'] },
  { href: '/vendor/credits', label: 'Credit Accounts', icon: HandCoins, modules: ['finance'] },
  { href: '/vendor/payouts', label: 'Payout Settings', icon: Wallet, modules: ['finance'], managerOnly: true },
  // Was labeled only "My Profile" -- this IS the vendor's settings page
  // (backed by /api/vendor/settings), already fully accessible to every
  // Owner/Manager (modules: null), but an Owner/Manager looking for
  // "Settings" specifically didn't recognize this as it and believed they
  // had no settings access at all.
  { href: '/vendor/billing', label: 'Billing & Plan', icon: CreditCard, modules: null },
  { href: '/vendor/telegram', label: 'Telegram Alerts', icon: Send, modules: null },
  { href: '/vendor/profile', label: 'My Profile / Settings', icon: User, modules: null },
  { href: '/vendor/statement', label: 'Financial Statement', icon: BarChart3, modules: ['finance'] },
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
        {/* Brand */}
        <div className="p-5 border-b border-border">
          <p className="text-[10px] uppercase tracking-[0.45em] text-ink-3 mb-1">
            Vendor Portal
          </p>
          <div className="flex items-center gap-2.5 mt-3">
            <div className="h-8 w-8 rounded-control bg-accent-soft border border-accent/20 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink truncate max-w-[140px]">
                {userName}
              </p>
              <p className="text-[10px] text-ink-3">Vendor Account</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink transition-all duration-150 text-sm group"
            >
              <item.icon className="h-4 w-4 flex-shrink-0 group-hover:text-accent transition-colors" />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="rounded-control border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <p className="text-xs text-ink-2">Portal Active</p>
            </div>
            <p className="text-[10px] text-ink-3">AN Group Vendor System</p>
          </div>
          <VendorLogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6">{children}</div>
      </main>
      {/* Per explicit direction: no separate floating bell in the vendor
          portal -- notifications live inside ANu instead (see AnuWidget's
          showNotifications prop). */}
      <AnuWidget showNotifications />
    </div>
  )
}
