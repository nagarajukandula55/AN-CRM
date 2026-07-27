'use client'

import Link from 'next/link'
import {
  PhoneCall, ClipboardList, ShoppingCart, ShieldCheck, Zap, BarChart3,
  ArrowRight, CheckCircle2, Building2, Users, Sparkles,
} from 'lucide-react'

/**
 * AN-CRM public, pre-login marketing homepage. Premium/glossy/interactive
 * per explicit direction ("Home page before login screen ensure that
 * should be like either glossy or most interactive UI") -- this is the
 * product's own storefront, promoting the CRM itself (Brand/SC/POS) to
 * prospective customers, not a generic ecommerce landing page. Built as a
 * new component (not editing the inherited marketing/HomePage.tsx from
 * ANgroup) so nothing else that might still reference the old one breaks.
 */

const MODES = [
  {
    icon: Building2,
    title: 'Brand',
    description: 'Multi-role operations — CCO, Manager, Engineer dashboards, call center and appointment booking, all in one command center.',
  },
  {
    icon: ClipboardList,
    title: 'Service Center',
    description: 'Single login, single screen. Log a call, diagnose, repair, bill — the entire workorder lifecycle without switching pages.',
  },
  {
    icon: ShoppingCart,
    title: 'Point of Sale',
    description: 'GST-ready billing that scales from a single counter to a multi-outlet enterprise, without changing systems.',
  },
]

const FEATURES = [
  { icon: PhoneCall, title: 'Call to Close, Tracked', description: 'Every call, every workorder, every invoice — one continuous, auditable trail.' },
  { icon: ShieldCheck, title: 'GST & Non-GST, Done Right', description: 'Automatic tax handling per business rules — never miscalculated, never mixed up.' },
  { icon: Zap, title: 'Fast by Design', description: 'Built for speed — no full-page reloads, no waiting on a slow dashboard.' },
  { icon: BarChart3, title: 'Real Numbers, Real Time', description: 'Revenue, calls, workorders — a live summary for every role, every day.' },
]

export default function CrmHomePage() {
  return (
    <div className="min-h-screen bg-bg text-ink overflow-x-hidden">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(1200px 600px at 20% -10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%), radial-gradient(900px 500px at 90% 10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 55%)',
          }}
        />
        <nav className="max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2 font-semibold text-lg tracking-tight">
            <div className="h-8 w-8 rounded-control bg-accent flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-accent-fg" />
            </div>
            AN-CRM
          </div>
          <div className="flex items-center gap-3">
            <Link href="/track-workorder" className="text-sm text-ink-2 hover:text-ink transition-colors hidden sm:block">
              Track a Repair
            </Link>
            <Link
              href="/login"
              className="rounded-control bg-accent text-accent-fg px-4 py-2 text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Sign in
            </Link>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto px-6 pt-16 pb-24 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-control border border-border-strong bg-surface/60 backdrop-blur px-3 py-1 text-xs text-ink-2 mb-6">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            One platform. Every operating mode.
          </div>
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
            The CRM built for
            <br />
            <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
              how service businesses actually run
            </span>
          </h1>
          <p className="mt-6 text-lg text-ink-2 max-w-2xl mx-auto">
            Brand operations, single-screen service centers, and point-of-sale billing —
            one system, purpose-built for each, never forcing one shape onto all three.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/login"
              className="rounded-control bg-accent text-accent-fg px-6 py-3 text-sm font-medium hover:bg-accent-hover transition-all hover:scale-[1.02] shadow-card-lg flex items-center gap-2"
            >
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/track-workorder"
              className="rounded-control border border-border-strong bg-surface px-6 py-3 text-sm font-medium hover:bg-surface-2 transition-colors"
            >
              Track My Repair
            </Link>
          </div>
        </div>
      </section>

      {/* ── Operating modes ──────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="eyebrow">Built for three distinct realities</div>
          <h2 className="h-page mt-2">Not one-size-fits-all</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {MODES.map((mode) => (
            <div
              key={mode.title}
              className="group rounded-card border border-border bg-surface p-6 shadow-card hover:shadow-card-lg hover:border-border-strong transition-all hover:-translate-y-1"
            >
              <div className="h-11 w-11 rounded-control bg-accent-soft flex items-center justify-center mb-4 group-hover:bg-accent group-hover:text-accent-fg transition-colors">
                <mode.icon className="h-5 w-5 text-accent group-hover:text-accent-fg" />
              </div>
              <h3 className="h-section">{mode.title}</h3>
              <p className="text-ink-2 text-sm mt-2 leading-relaxed">{mode.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────── */}
      <section className="bg-surface-2/50 border-y border-border">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <div className="eyebrow">Why teams switch</div>
            <h2 className="h-page mt-2">Everything else keeps missing something</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-card bg-surface border border-border p-5 shadow-card">
                <f.icon className="h-5 w-5 text-accent mb-3" />
                <h3 className="font-medium text-sm">{f.title}</h3>
                <p className="text-ink-3 text-xs mt-1.5 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="rounded-card border border-border-strong bg-surface p-8 sm:p-10 shadow-card-lg flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="h-section flex items-center gap-2">
              <Users className="h-5 w-5 text-accent" /> Ready when you are
            </h3>
            <p className="text-ink-2 text-sm mt-1">Vendors and businesses onboard in minutes — one shared signup, no separate steps.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/register?tab=vendor"
              className="rounded-control bg-accent text-accent-fg px-5 py-2.5 text-sm font-medium hover:bg-accent-hover transition-colors flex items-center gap-2"
            >
              Become a Partner <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/appointment-request"
              className="rounded-control border border-border-strong px-5 py-2.5 text-sm font-medium hover:bg-surface-2 transition-colors flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" /> Book a Service
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-xs text-ink-3">
          © {new Date().getFullYear()} AN-CRM. Built for AN Group.
        </div>
      </footer>
    </div>
  )
}
