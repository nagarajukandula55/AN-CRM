'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Check, ArrowRight, Sparkles, Clock3 } from 'lucide-react'
import { PLANS_BY_MODE, BILLING_PERIODS, priceForPeriod, isLaunchPricingActive, type BillingPeriod, type PlanKey } from '@/core/pricing/plans'
import Logo from '@/components/marketing/Logo'
import {
  mbfButtonPrimary,
  mbfButtonNav,
  mbfButtonGhostNav,
  mbfPageBg,
  mbfGlow,
  mbfCard,
} from '@/components/marketing/mbfTheme'
import { ComparisonSection } from '@/components/marketing/ComparisonTable'
import { PricingFaq } from '@/components/marketing/PricingFaq'

/**
 * Public pricing page -- Basic/Pro/Ultimate ladder for Service Center,
 * the only operating mode this app supports x Monthly/Quarterly/
 * Half-Yearly/Yearly/2-Year. Launch pricing auto-switches to standard at
 * LAUNCH_PRICING_CUTOVER -- see core/pricing/plans.ts, the single source
 * of truth these render from.
 *
 * Now on the same "MBF Neon" theme (./mbfTheme.ts) the homepage uses --
 * was still the plain light app-shell palette with a literal "AN-CRM"
 * text logo, both reported live ("website price page having AN-CRM sign
 * still and also not aligned with rest home page UI").
 */

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`

interface LiveConfig {
  launchPricingActive: boolean
  plans: { key: PlanKey; periods: { key: BillingPeriod; total: number; perMonth: number; discountPct: number }[] }[]
}

export default function PricingPage() {
  const [period, setPeriod] = useState<BillingPeriod>('YEARLY')
  const PLANS = PLANS_BY_MODE.SC

  // Live, admin-overridable numbers (see api/pricing/config's own comment)
  // -- falls back to the static plans.ts computation below until this
  // loads (or if it ever fails), so the page never shows a blank price.
  const [live, setLive] = useState<LiveConfig | null>(null)
  useEffect(() => {
    fetch('/api/pricing/config').then((r) => r.json()).then((d) => { if (d?.success) setLive(d) }).catch(() => {})
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'PRICING_PAGE_VIEW' }),
    }).catch(() => {})
  }, [])
  const launchActive = live ? live.launchPricingActive : isLaunchPricingActive()
  function priceFor(plan: (typeof PLANS)[number]) {
    const livePlan = live?.plans.find((p) => p.key === plan.key)
    const livePeriod = livePlan?.periods.find((p) => p.key === period)
    return livePeriod || priceForPeriod(plan, period)
  }

  return (
    <div className={mbfPageBg}>
      <div aria-hidden className={`${mbfGlow('blue')} -right-40 -top-40 h-[36rem] w-[36rem]`} />
      <div aria-hidden className={`${mbfGlow('orange')} -left-40 top-52 h-[28rem] w-[28rem]`} />

      <nav className="relative z-10 w-full flex items-center justify-between px-6 sm:px-12 py-6">
        <Link href="/"><Logo className="!text-white" /></Link>
        <div className="flex items-center gap-3">
          <Link href="/track-workorder" className={mbfButtonGhostNav}>
            <Clock3 className="h-3.5 w-3.5" /> Track a Repair
          </Link>
          <Link href="/login" className={mbfButtonNav}>
            Sign in
          </Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-10 pb-24">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-white/5 backdrop-blur px-3.5 py-1.5 text-xs font-medium text-sky-300 mb-4">
            <Sparkles className="h-3.5 w-3.5" /> Simple, transparent pricing
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">Pick the plan that fits your shop</h1>
          <p className="text-gray-400 mt-4 max-w-xl mx-auto">
            Single-login, single-screen workorder shop — pick a billing period below.
          </p>
          {launchActive && (
            <div className="inline-flex items-center gap-1.5 mt-4 rounded-full border border-green-400/30 bg-white/5 text-green-300 text-xs font-medium px-3.5 py-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Launch pricing — limited time, prices will rise soon
            </div>
          )}
        </div>

        {/* Billing period toggle */}
        <div className="flex items-center justify-center mb-12">
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-sm p-1 gap-1">
            {BILLING_PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  period === p.key
                    ? 'bg-gradient-to-r from-sky-400 to-orange-400 text-[#05060d]'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                {p.label}
                {p.discountPct > 0 && (
                  <span className={`ml-1.5 text-xs ${period === p.key ? 'text-[#05060d]/70' : 'text-green-300'}`}>
                    −{p.discountPct}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start max-w-5xl mx-auto">
          {PLANS.map((plan) => {
            const price = priceFor(plan)
            const periodLabel = BILLING_PERIODS.find((p) => p.key === period)!
            return (
              <div
                key={plan.key}
                className={`${mbfCard} p-7 flex flex-col relative ${plan.highlight ? '!border-sky-400/40 scale-[1.02]' : ''}`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-sky-400 to-orange-400 text-[#05060d] text-xs font-semibold px-3 py-1">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                <p className="text-gray-400 text-sm mt-1 min-h-[40px]">{plan.tagline}</p>

                <div className="mt-5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tabular-nums text-white">{fmt(price.perMonth)}</span>
                    <span className="text-gray-500 text-sm">/month + GST</span>
                  </div>
                  {periodLabel.months > 1 && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-green-400/30 bg-green-400/10 px-3 py-1">
                      <span className="text-sm font-semibold text-green-300">{fmt(price.total)} + GST</span>
                      <span className="text-[11px] text-green-300/70">total for {periodLabel.label.toLowerCase()} ({periodLabel.months} months)</span>
                    </div>
                  )}
                  {plan.freeTrialDays && (
                    <p className="text-xs text-green-300 mt-1 font-medium">{plan.freeTrialDays}-day free trial</p>
                  )}
                </div>

                <div className="text-xs text-gray-500 mt-3 pb-4 border-b border-white/10">{plan.seatLimit}</div>

                <ul className="space-y-2.5 mt-4 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                      <Check className="h-4 w-4 text-sky-300 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/register?plan=${plan.key.toLowerCase()}&mode=sc`}
                  onClick={() => {
                    fetch('/api/analytics/track', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'PLAN_SELECTED', planKey: plan.key, billingPeriod: period }),
                    }).catch(() => {})
                  }}
                  className={
                    plan.highlight
                      ? `${mbfButtonPrimary} mt-6 !py-2.5 !text-sm`
                      : 'mt-6 rounded-full px-4 py-2.5 text-sm font-medium text-center transition-colors flex items-center justify-center gap-2 border border-white/15 text-gray-200 hover:border-sky-400/40 hover:text-sky-300'
                  }
                >
                  {plan.freeTrialDays ? 'Start Free Trial' : 'Get Started'} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )
          })}
        </div>

        <p className="text-center text-xs text-gray-500 mt-10">
          Prices shown are exclusive of GST — 18% GST is added at checkout. By
          subscribing you agree to our{' '}
          <Link href="/terms" className="underline hover:text-gray-300">Terms of Service</Link> and{' '}
          <Link href="/refund-policy" className="underline hover:text-gray-300">Cancellation Policy</Link>.
        </p>

        <ComparisonSection />
        <PricingFaq />
      </div>
    </div>
  )
}
