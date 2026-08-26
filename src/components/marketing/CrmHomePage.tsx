'use client'

import Link from 'next/link'
import {
  PhoneCall, ClipboardList, ShieldCheck, Zap, BarChart3,
  ArrowRight, CheckCircle2, Building2, Users, Sparkles, Smartphone, Tablet,
  Clock3, Facebook, Twitter, Linkedin, Instagram, Mail, MapPin, Phone,
} from 'lucide-react'
import Logo from './Logo'
import {
  mbfButtonPrimary,
  mbfButtonSecondary,
  mbfButtonNav,
  mbfButtonGhostNav,
  mbfPageBg,
  mbfGlow,
  mbfGradientText,
  mbfCard,
} from './mbfTheme'

/**
 * My Biz Flow (public product name -- AN-CRM is this repo's internal name
 * only) public, pre-login marketing homepage. On its OWN "MBF Neon" dark
 * theme (./mbfTheme.ts) -- deliberately NOT the same palette as ANgroup's
 * "Light Neon" (./theme.ts, still used by partner-signup/appointment-
 * request), per explicit direction ("this colour scheme we already built
 * for AN Group but this should be more neon style and more modern").
 * Full-bleed sections (no narrow centered column) per explicit direction
 * ("this is again center aligned but this should be full page").
 *
 * Product previews below are REAL screenshots of this app's own actual
 * public pages (public/screenshots/*.png, captured live) -- not abstract
 * icon mockups -- per explicit direction ("use icons, screenshots of our
 * services or pages"). Authenticated console pages (dashboard, workorder
 * screen, etc.) aren't screenshottable from here since this environment
 * has no seeded login/demo data; swap in real console screenshots the
 * same one-file way once available.
 */

type VendorType = {
  type: 'SC'
  icon: typeof Building2
  title: string
  description: string
  activation: string
  activationTone: 'instant' | 'review'
}

// Brand and Point of Sale vendor types were removed -- this is now an
// SC-only (Service Center) platform.
const VENDOR_TYPES: VendorType[] = [
  {
    type: 'SC',
    icon: ClipboardList,
    title: 'Service Center',
    description: 'Single login, single screen. Log a call, diagnose, repair, bill — the entire workorder lifecycle without switching pages.',
    activation: 'Instant access — no waiting on approval',
    activationTone: 'instant',
  },
]

const FEATURES = [
  { icon: PhoneCall, title: 'Call to Close, Tracked', description: 'Every call, every workorder, every invoice — one continuous, auditable trail.' },
  { icon: ShieldCheck, title: 'GST & Non-GST, Done Right', description: 'Automatic tax handling per business rules — never miscalculated, never mixed up.' },
  { icon: Zap, title: 'Fast by Design', description: 'Built for speed — no full-page reloads, no waiting on a slow dashboard.' },
  { icon: BarChart3, title: 'Real Numbers, Real Time', description: 'Revenue, calls, workorders — a live summary for every role, every day.' },
]

const PREVIEWS: { src: string; label: string; href: string }[] = [
  { src: '/screenshots/track-workorder.png', label: 'Track a repair, no login needed', href: '/track-workorder' },
  { src: '/screenshots/partner-signup.png', label: 'Sign up in one guided flow', href: '/partner-signup' },
  { src: '/screenshots/login.png', label: 'One login, one screen', href: '/login' },
]

function ScreenshotFrame({ src, label, href }: { src: string; label: string; href: string }) {
  return (
    <Link href={href} className={`${mbfCard} block overflow-hidden group`}>
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.02] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-fuchsia-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-cyan-300/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-lime-300/70" />
      </div>
      <div className="relative h-64 overflow-hidden bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element -- real captured screenshot, not an optimizable remote asset */}
        <img
          src={src}
          alt={label}
          className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="px-4 py-3 text-sm font-medium text-gray-200">{label}</div>
    </Link>
  )
}

const FOOTER_COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Pricing', href: '/pricing' },
      { label: 'Sign up as Service Center', href: '/partner-signup' },
      { label: 'Track a Repair', href: '/track-workorder' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Contact', href: '/contact' },
      { label: 'Sign in', href: '/login' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Refund & Cancellation', href: '/refund-policy' },
      { label: 'Vendor Agreement', href: '/vendor-agreement' },
    ],
  },
]

export default function CrmHomePage() {
  return (
    <div className={mbfPageBg}>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className={`${mbfGlow('cyan')} -right-40 -top-40 h-[36rem] w-[36rem]`} />
        <div aria-hidden className={`${mbfGlow('magenta')} -left-40 top-52 h-[28rem] w-[28rem]`} />
        <div aria-hidden className={`${mbfGlow('lime')} right-1/3 bottom-0 h-72 w-72 opacity-60`} />

        <nav className="relative z-10 w-full flex items-center justify-between px-6 sm:px-12 py-6">
          <Logo className="!text-white" />
          <div className="flex items-center gap-3">
            <Link href="/pricing" className="text-sm font-medium text-gray-300 hover:text-cyan-300 transition-colors hidden sm:block">
              Pricing
            </Link>
            <Link href="/track-workorder" className={mbfButtonGhostNav}>
              <Clock3 className="h-3.5 w-3.5" /> Track a Repair
            </Link>
            <Link href="/login" className={mbfButtonNav}>
              Sign in
            </Link>
          </div>
        </nav>

        <div className="relative z-10 w-full px-6 sm:px-12 pt-16 pb-24 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-white/5 backdrop-blur px-3.5 py-1.5 text-xs font-medium text-cyan-300 mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Built for Service Centers.
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-white">
            The business platform built for
            <br />
            <span className={mbfGradientText}>how you actually operate</span>
          </h1>
          <p className="mt-6 text-lg text-gray-400 max-w-2xl mx-auto">
            Single login, single screen — call to close, diagnosis to billing,
            the entire service center workorder lifecycle in one place.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            <a href="#signup-types" className={mbfButtonPrimary}>
              Get Started <ArrowRight className="h-4 w-4" />
            </a>
            <Link href="/track-workorder" className={mbfButtonSecondary}>
              Track My Repair
            </Link>
          </div>
        </div>
      </section>

      {/* ── Product preview (real screenshots) ──────────────────────── */}
      <section className="w-full px-6 sm:px-12 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PREVIEWS.map((p) => (
            <ScreenshotFrame key={p.label} {...p} />
          ))}
        </div>
      </section>

      {/* ── Sign up, split by type ───────────────────────────────────── */}
      <section id="signup-types" className="w-full px-6 sm:px-12 py-20 scroll-mt-6 border-t border-white/5">
        <div className="text-center mb-12">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Get started</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Built for Service Centers
          </h2>
          <p className="mt-3 text-gray-400 max-w-xl mx-auto">
            Sign up and get instant access — no waiting on approval.
          </p>
        </div>
        <div className="grid grid-cols-1 max-w-md mx-auto gap-5">
          {VENDOR_TYPES.map((v) => (
            <div key={v.type} className={`${mbfCard} p-6 flex flex-col`}>
              <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-cyan-400 to-fuchsia-400 flex items-center justify-center mb-4 shadow-[0_0_20px_-4px_rgba(0,229,255,0.6)]">
                <v.icon className="h-5 w-5 text-[#05060d]" />
              </div>
              <h3 className="text-lg font-bold text-white">{v.title}</h3>
              <p className="text-gray-400 text-sm mt-2 leading-relaxed flex-1">{v.description}</p>
              <div
                className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium w-fit border ${
                  v.activationTone === 'instant' ? 'bg-lime-400/10 text-lime-300 border-lime-400/30' : 'bg-amber-400/10 text-amber-300 border-amber-400/30'
                }`}
              >
                {v.activationTone === 'instant' ? <Zap className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                {v.activation}
              </div>
              <Link
                href="/partner-signup"
                className={`${mbfButtonPrimary} mt-5 w-full`}
              >
                Sign up as {v.title} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="w-full px-6 sm:px-12 py-20">
          <div className="text-center mb-12">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Why teams switch</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Everything else keeps missing something</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className={`${mbfCard} p-5`}>
                <f.icon className="h-5 w-5 text-cyan-300 mb-3" />
                <h3 className="font-semibold text-sm text-white">{f.title}</h3>
                <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────────── */}
      <section className="w-full px-6 sm:px-12 py-16">
        <div className={`${mbfCard} p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6`}>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-cyan-300" /> Ready when you are
            </h3>
            <p className="text-gray-400 text-sm mt-1">Pick your type above and you're on your way — no separate signup, no extra steps.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <a href="#signup-types" className={mbfButtonPrimary}>
              Become a Partner <ArrowRight className="h-4 w-4" />
            </a>
            <Link href="/track-workorder" className={mbfButtonSecondary}>
              <CheckCircle2 className="h-4 w-4" /> Track a Repair
            </Link>
          </div>
        </div>
      </section>

      {/* App downloads -- placeholders, per explicit direction ("add
          placeholders for these applications downloads in home page").
          Mobile/tablet apps themselves are a separate, not-yet-started
          build (see PROGRESS.md) -- these links are inert until then. */}
      <section className="w-full px-6 sm:px-12 pb-16">
        <div className="text-center mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Coming soon</p>
          <h3 className="mt-1 text-xl font-bold text-white">Take My Biz Flow anywhere</h3>
        </div>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 opacity-60 cursor-not-allowed">
            <Smartphone className="h-6 w-6 text-gray-500" />
            <div>
              <div className="text-[10px] text-gray-500">GET IT ON</div>
              <div className="text-sm font-medium text-gray-300">Google Play</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 opacity-60 cursor-not-allowed">
            <Smartphone className="h-6 w-6 text-gray-500" />
            <div>
              <div className="text-[10px] text-gray-500">DOWNLOAD ON THE</div>
              <div className="text-sm font-medium text-gray-300">App Store</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 opacity-60 cursor-not-allowed">
            <Tablet className="h-6 w-6 text-gray-500" />
            <div>
              <div className="text-[10px] text-gray-500">OPTIMIZED FOR</div>
              <div className="text-sm font-medium text-gray-300">Tablet</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer -- full MNC-style multi-column, not a single small
          centered line ─────────────────────────────────────────────── */}
      <footer className="w-full border-t border-white/10 bg-black/40">
        <div className="w-full px-6 sm:px-12 py-14 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-10">
          <div className="col-span-2">
            <Logo className="!text-white" />
            <p className="mt-3 text-sm text-gray-400 max-w-xs">
              The service center management platform — built for how you actually run repairs.
            </p>
            <div className="mt-5 flex items-center gap-3">
              {[Facebook, Twitter, Linkedin, Instagram].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label="social link"
                  className="h-8 w-8 rounded-full border border-white/10 flex items-center justify-center text-gray-400 hover:text-cyan-300 hover:border-cyan-400/40 transition-colors"
                >
                  <Icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-500">{col.heading}</h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="text-sm text-gray-400 hover:text-cyan-300 transition-colors">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Get in touch</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-gray-400">
              <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-cyan-300 shrink-0" /> connectwithangroup@gmail.com</li>
              <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-cyan-300 shrink-0" /> Contact us</li>
              <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-cyan-300 shrink-0" /> India</li>
            </ul>
          </div>
        </div>

        <div className="w-full border-t border-white/5 px-6 sm:px-12 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <div>© {new Date().getFullYear()} My Biz Flow. Built for AN Group.</div>
          <div className="flex items-center gap-4">
            <a href="/terms" className="hover:text-cyan-300 transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-cyan-300 transition-colors">Privacy</a>
            <a href="/refund-policy" className="hover:text-cyan-300 transition-colors">Refunds</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
