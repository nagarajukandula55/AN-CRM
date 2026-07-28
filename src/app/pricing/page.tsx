'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Check, ArrowRight, Sparkles } from 'lucide-react'
import { PLANS_BY_MODE, OPERATING_MODES, BILLING_PERIODS, priceForPeriod, type BillingPeriod, type OperatingMode } from '@/core/pricing/plans'

/**
 * Public pricing page -- separate Basic/Pro/Ultimate ladders per operating
 * mode (SC/Brand/POS), per explicit direction: "for SC - Basic, Pro &
 * Ultimate and then for Brand ... and for POS ... because for those
 * businesses what we are providing is matters." x Monthly/Quarterly/Half-
 * Yearly/Yearly, 7-day free trial on Basic. Placeholder numbers per
 * explicit direction; see core/pricing/plans.ts for the single source of
 * truth these render from.
 */

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`

export default function PricingPage() {
  const [mode, setMode] = useState<OperatingMode>('SC')
  const [period, setPeriod] = useState<BillingPeriod>('YEARLY')
  const PLANS = PLANS_BY_MODE[mode]

  return (
    <div className="min-h-screen bg-bg text-ink">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg tracking-tight">
          <div className="h-8 w-8 rounded-control bg-accent flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-accent-fg" />
          </div>
          AN-CRM
        </Link>
        <Link href="/login" className="rounded-control bg-accent text-accent-fg px-4 py-2 text-sm font-medium hover:bg-accent-hover transition-colors">
          Sign in
        </Link>
      </nav>

      <div className="max-w-6xl mx-auto px-6 pt-10 pb-24">
        <div className="text-center mb-10">
          <div className="eyebrow">Simple, transparent pricing</div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mt-2">Pick what fits how you operate</h1>
          <p className="text-ink-2 mt-4 max-w-xl mx-auto">
            Pricing is tailored to how you operate — pick your mode below.
          </p>
        </div>

        {/* Operating mode tabs */}
        <div className="flex items-center justify-center mb-6">
          <div className="inline-flex rounded-control border border-border-strong bg-surface p-1 gap-1">
            {OPERATING_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`px-4 py-2 rounded-control text-sm font-medium transition-colors ${
                  mode === m.key ? 'bg-accent text-accent-fg' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-center text-sm text-ink-3 mb-8">{OPERATING_MODES.find((m) => m.key === mode)!.blurb}</p>

        {/* Billing period toggle */}
        <div className="flex items-center justify-center mb-12">
          <div className="inline-flex rounded-control border border-border-strong bg-surface p-1 gap-1">
            {BILLING_PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-2 rounded-control text-sm font-medium transition-colors ${
                  period === p.key ? 'bg-accent text-accent-fg' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {p.label}
                {p.discountPct > 0 && (
                  <span className={`ml-1.5 text-xs ${period === p.key ? 'text-accent-fg/80' : 'text-success'}`}>
                    −{p.discountPct}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => {
            const price = priceForPeriod(plan, period)
            const periodLabel = BILLING_PERIODS.find((p) => p.key === period)!
            return (
              <div
                key={plan.key}
                className={`rounded-card border p-7 flex flex-col ${
                  plan.highlight
                    ? 'border-accent shadow-card-lg relative bg-surface scale-[1.02]'
                    : 'border-border bg-surface shadow-card'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-control bg-accent text-accent-fg text-xs font-medium px-3 py-1">
                    Most Popular
                  </div>
                )}
                <h3 className="h-section">{plan.name}</h3>
                <p className="text-ink-2 text-sm mt-1 min-h-[40px]">{plan.tagline}</p>

                <div className="mt-5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tabular">{fmt(price.perMonth)}</span>
                    <span className="text-ink-3 text-sm">/month</span>
                  </div>
                  {periodLabel.months > 1 && (
                    <p className="text-xs text-ink-3 mt-1">
                      {fmt(price.total)} billed every {periodLabel.months} months
                    </p>
                  )}
                  {plan.freeTrialDays && (
                    <p className="text-xs text-success mt-1 font-medium">{plan.freeTrialDays}-day free trial</p>
                  )}
                </div>

                <div className="text-xs text-ink-3 mt-3 pb-4 border-b border-border">{plan.seatLimit}</div>

                <ul className="space-y-2.5 mt-4 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-ink-2">
                      <Check className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/register?plan=${plan.key.toLowerCase()}&mode=${mode.toLowerCase()}`}
                  className={`mt-6 rounded-control px-4 py-2.5 text-sm font-medium text-center transition-colors flex items-center justify-center gap-2 ${
                    plan.highlight
                      ? 'bg-accent text-accent-fg hover:bg-accent-hover'
                      : 'border border-border-strong hover:bg-surface-2'
                  }`}
                >
                  {plan.freeTrialDays ? 'Start Free Trial' : 'Get Started'} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )
          })}
        </div>

        <p className="text-center text-xs text-ink-3 mt-10">
          Prices shown are indicative and may change. GST as applicable. By
          subscribing you agree to our{' '}
          <Link href="/terms" className="underline hover:text-ink">Terms of Service</Link> and{' '}
          <Link href="/refund-policy" className="underline hover:text-ink">Refund &amp; Cancellation Policy</Link>.
        </p>
      </div>
    </div>
  )
}
