'use client'

import Link from 'next/link'
import {
  PhoneCall, ClipboardList, ShoppingCart, ShieldCheck, Zap, BarChart3,
  ArrowRight, CheckCircle2, Building2, Users, Sparkles, Smartphone, Tablet,
  Clock3, LayoutDashboard, Receipt, Wrench,
} from 'lucide-react'
import Logo from './Logo'
import {
  neonButtonPrimary,
  neonButtonSecondary,
  neonButtonNav,
  neonButtonGhostNav,
  neonPageBg,
  neonGlow,
  neonGradientText,
  neonCard,
} from './theme'

/**
 * My Biz Flow (public product name -- AN-CRM is this repo's internal name
 * only) public, pre-login marketing homepage. Rebuilt on the "Light Neon"
 * theme (see ./theme.ts) that partner-signup already used, so the whole
 * pre-login surface reads as one consistent product instead of this page
 * alone still looking like the plain in-app design system. Per explicit
 * direction: no separate generic signup -- the CTA is split by vendor
 * type up front (SC / Brand / POS), each linking straight into
 * /partner-signup?type=... with that type pre-selected and its own
 * instant-vs-reviewed messaging already visible before the visitor clicks
 * through.
 */

type VendorType = {
  type: 'SC' | 'BRAND' | 'POS'
  icon: typeof Building2
  title: string
  description: string
  activation: string
  activationTone: 'instant' | 'review'
}

const VENDOR_TYPES: VendorType[] = [
  {
    type: 'BRAND',
    icon: Building2,
    title: 'Brand',
    description: 'Multi-role operations — CCO, Manager, Engineer dashboards, call center and appointment booking, all in one command center.',
    activation: 'Reviewed by our team before activation',
    activationTone: 'review',
  },
  {
    type: 'SC',
    icon: ClipboardList,
    title: 'Service Center',
    description: 'Single login, single screen. Log a call, diagnose, repair, bill — the entire workorder lifecycle without switching pages.',
    activation: 'Instant access — no waiting on approval',
    activationTone: 'instant',
  },
  {
    type: 'POS',
    icon: ShoppingCart,
    title: 'Point of Sale',
    description: 'GST-ready billing that scales from a single counter to a multi-outlet enterprise, without changing systems.',
    activation: 'Reviewed by our team before activation',
    activationTone: 'review',
  },
]

const FEATURES = [
  { icon: PhoneCall, title: 'Call to Close, Tracked', description: 'Every call, every workorder, every invoice — one continuous, auditable trail.' },
  { icon: ShieldCheck, title: 'GST & Non-GST, Done Right', description: 'Automatic tax handling per business rules — never miscalculated, never mixed up.' },
  { icon: Zap, title: 'Fast by Design', description: 'Built for speed — no full-page reloads, no waiting on a slow dashboard.' },
  { icon: BarChart3, title: 'Real Numbers, Real Time', description: 'Revenue, calls, workorders — a live summary for every role, every day.' },
]

/** Abstract product-preview mockups (NOT real screenshots -- placeholders
 * built purely from CSS/icons, same "swap later" pattern as Logo.tsx's
 * text wordmark) until real product screenshots are captured and dropped
 * in as actual images. */
const PREVIEWS: { icon: typeof LayoutDashboard; label: string }[] = [
  { icon: LayoutDashboard, label: 'Live operations dashboard' },
  { icon: Wrench, label: 'Single-screen workorder flow' },
  { icon: Receipt, label: 'GST-ready billing counter' },
]

function BrowserMockup({ icon: Icon, label }: { icon: typeof LayoutDashboard; label: string }) {
  return (
    <div className={`${neonCard} overflow-hidden`}>
      <div className="flex items-center gap-1.5 border-b border-violet-100 bg-violet-50/50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-pink-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
      </div>
      <div className="flex h-56 flex-col items-center justify-center gap-3 bg-gradient-to-br from-violet-50/60 via-white to-cyan-50/50 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 shadow-[0_8px_24px_-6px_rgba(139,92,246,0.5)]">
          <Icon className="h-7 w-7 text-white" />
        </div>
        <p className="text-sm font-medium text-gray-600">{label}</p>
        <p className="text-[10px] uppercase tracking-widest text-gray-400">Preview — real screenshots coming soon</p>
      </div>
    </div>
  )
}

export default function CrmHomePage() {
  return (
    <div className={`${neonPageBg} overflow-x-hidden`}>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative">
        <div aria-hidden className={`${neonGlow('violet')} -right-40 -top-40 h-[32rem] w-[32rem]`} />
        <div aria-hidden className={`${neonGlow('cyan')} -left-40 top-40 h-96 w-96 opacity-70`} />

        <nav className="relative z-10 max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
          <Logo />
          <div className="flex items-center gap-3">
            <Link href="/pricing" className="text-sm font-medium text-gray-600 hover:text-violet-700 transition-colors hidden sm:block">
              Pricing
            </Link>
            <Link href="/track-workorder" className={neonButtonGhostNav}>
              <Clock3 className="h-3.5 w-3.5" /> Track a Repair
            </Link>
            <Link href="/login" className={neonButtonNav}>
              Sign in
            </Link>
          </div>
        </nav>

        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white/70 backdrop-blur px-3.5 py-1.5 text-xs font-medium text-violet-700 mb-6">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            One platform. Every operating mode.
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05] text-gray-900">
            The CRM built for
            <br />
            <span className={neonGradientText}>how service businesses actually run</span>
          </h1>
          <p className="mt-6 text-lg text-gray-500 max-w-2xl mx-auto">
            Brand operations, single-screen service centers, and point-of-sale billing —
            one system, purpose-built for each, never forcing one shape onto all three.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            <a href="#signup-types" className={neonButtonPrimary}>
              Get Started <ArrowRight className="h-4 w-4" />
            </a>
            <Link href="/track-workorder" className={neonButtonSecondary}>
              Track My Repair
            </Link>
          </div>
        </div>
      </section>

      {/* ── Product preview (placeholder mockups) ───────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PREVIEWS.map((p) => (
            <BrowserMockup key={p.label} icon={p.icon} label={p.label} />
          ))}
        </div>
      </section>

      {/* ── Sign up, split by type ───────────────────────────────────── */}
      <section id="signup-types" className="max-w-6xl mx-auto px-6 py-20 scroll-mt-6">
        <div className="text-center mb-12">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-500">Get started</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            Sign up as the type you actually are
          </h2>
          <p className="mt-3 text-gray-500 max-w-xl mx-auto">
            Pick your operating mode below — Service Center gets instant access,
            Brand and POS applications are reviewed by our team first.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {VENDOR_TYPES.map((v) => (
            <div key={v.type} className={`${neonCard} p-6 flex flex-col`}>
              <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center mb-4 shadow-[0_6px_20px_-6px_rgba(139,92,246,0.5)]">
                <v.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">{v.title}</h3>
              <p className="text-gray-500 text-sm mt-2 leading-relaxed flex-1">{v.description}</p>
              <div
                className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium w-fit ${
                  v.activationTone === 'instant' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {v.activationTone === 'instant' ? <Zap className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                {v.activation}
              </div>
              <Link
                href={`/partner-signup?type=${v.type}`}
                className={`${neonButtonPrimary} mt-5 w-full`}
              >
                Sign up as {v.title} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────── */}
      <section className="border-y border-violet-100 bg-white/60 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-500">Why teams switch</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">Everything else keeps missing something</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className={`${neonCard} p-5`}>
                <f.icon className="h-5 w-5 text-violet-600 mb-3" />
                <h3 className="font-semibold text-sm text-gray-900">{f.title}</h3>
                <p className="text-gray-500 text-xs mt-1.5 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className={`${neonCard} p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6`}>
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-violet-600" /> Ready when you are
            </h3>
            <p className="text-gray-500 text-sm mt-1">Pick your type above and you're on your way — no separate signup, no extra steps.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <a href="#signup-types" className={neonButtonPrimary}>
              Become a Partner <ArrowRight className="h-4 w-4" />
            </a>
            <Link href="/appointment-request" className={neonButtonSecondary}>
              <CheckCircle2 className="h-4 w-4" /> Book a Service
            </Link>
          </div>
        </div>
      </section>

      {/* App downloads -- placeholders, per explicit direction ("add
          placeholders for these applications downloads in home page").
          Mobile/tablet apps themselves are a separate, not-yet-started
          build (see PROGRESS.md) -- these links are inert until then. */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="text-center mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-500">Coming soon</p>
          <h3 className="mt-1 text-xl font-bold text-gray-900">Take My Biz Flow anywhere</h3>
        </div>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-white px-5 py-3 opacity-60 cursor-not-allowed">
            <Smartphone className="h-6 w-6 text-gray-400" />
            <div>
              <div className="text-[10px] text-gray-400">GET IT ON</div>
              <div className="text-sm font-medium text-gray-600">Google Play</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-white px-5 py-3 opacity-60 cursor-not-allowed">
            <Smartphone className="h-6 w-6 text-gray-400" />
            <div>
              <div className="text-[10px] text-gray-400">DOWNLOAD ON THE</div>
              <div className="text-sm font-medium text-gray-600">App Store</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-white px-5 py-3 opacity-60 cursor-not-allowed">
            <Tablet className="h-6 w-6 text-gray-400" />
            <div>
              <div className="text-[10px] text-gray-400">OPTIMIZED FOR</div>
              <div className="text-sm font-medium text-gray-600">Tablet</div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-violet-100">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col items-center gap-3 text-center text-xs text-gray-400">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <a href="/terms" className="hover:text-violet-600 transition-colors">Terms of Service</a>
            <a href="/privacy" className="hover:text-violet-600 transition-colors">Privacy Policy</a>
            <a href="/refund-policy" className="hover:text-violet-600 transition-colors">Refund & Cancellation</a>
            <a href="/vendor-agreement" className="hover:text-violet-600 transition-colors">Vendor Agreement</a>
            <a href="/contact" className="hover:text-violet-600 transition-colors">Contact</a>
          </div>
          <div>© {new Date().getFullYear()} My Biz Flow. Built for AN Group.</div>
        </div>
      </footer>
    </div>
  )
}
