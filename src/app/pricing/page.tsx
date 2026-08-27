'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Check, ArrowRight, Sparkles, Clock3 } from 'lucide-react'
import { PLANS_BY_MODE, BILLING_PERIODS, priceForPeriod, isLaunchPricingActive, type BillingPeriod } from '@/core/pricing/plans'
import Logo from '@/components/marketing/Logo'
import {
  mbfButtonPrimary,
  mbfButtonNav,
  mbfButtonGhostNav,
  mbfPageBg,
  mbfGlow,
  mbfCard,
} from '@/components/marketing/mbfTheme'

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

export default function PricingPage() {
  const [period, setPeriod] = useState<BillingPeriod>('YEARLY')
  const PLANS = PLANS_BY_MODE.SC

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
          {isLaunchPricingActive() && (
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start max-w-3xl mx-auto">
          {PLANS.map((plan) => {
            const price = priceForPeriod(plan, period)
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
                    <p className="text-xs text-gray-500 mt-1">
                      {fmt(price.total)} + GST billed every {periodLabel.months} months
                    </p>
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
          <Link href="/refund-policy" className="underline hover:text-gray-300">Refund &amp; Cancellation Policy</Link>.
        </p>

        <ComparisonSection />
      </div>
    </div>
  )
}

type CompareCell = boolean | 'partial'

const COMPARE_COLUMNS = [
  { key: 'us', label: 'My Biz Flow' },
  { key: 'vyapar', label: 'Vyapar' },
  { key: 'mybillbook', label: 'myBillBook' },
  { key: 'marg', label: 'Marg ERP' },
] as const

const COMPARE_ROWS: { feature: string; us: CompareCell; vyapar: CompareCell; mybillbook: CompareCell; marg: CompareCell }[] = [
  { feature: 'Purpose-built repair workorder / job-sheet flow', us: true, vyapar: false, mybillbook: false, marg: 'partial' },
  { feature: 'Customer-facing repair status tracking page', us: true, vyapar: false, mybillbook: false, marg: false },
  { feature: 'GST & non-GST invoicing', us: true, vyapar: true, mybillbook: true, marg: true },
  { feature: 'Inventory, stock transfers & warehouses', us: true, vyapar: 'partial', mybillbook: 'partial', marg: true },
  { feature: 'Fault / symptom / solution code library', us: true, vyapar: false, mybillbook: false, marg: false },
  { feature: 'Custom report builder (build-your-own reports)', us: true, vyapar: false, mybillbook: false, marg: 'partial' },
  { feature: 'Multi-center / sub-vendor hierarchy under one login', us: true, vyapar: false, mybillbook: false, marg: 'partial' },
  { feature: 'Ledger Book (party-wise running balance)', us: true, vyapar: 'partial', mybillbook: 'partial', marg: true },
  { feature: 'Profit & Loss reports', us: true, vyapar: false, mybillbook: false, marg: 'partial' },
  { feature: 'Expense tracking', us: true, vyapar: false, mybillbook: false, marg: 'partial' },
  { feature: 'Automated Telegram business reports with charts', us: true, vyapar: false, mybillbook: false, marg: false },
  { feature: 'Starting price', us: '₹549/mo launch', vyapar: '₹999/yr', mybillbook: '₹799/yr', marg: '₹8,000+/yr' } as any,
]

function CompareIcon({ value }: { value: CompareCell }) {
  if (value === true) return <Check className="h-4 w-4 text-green-300 mx-auto" />
  if (value === 'partial') return <span className="block text-center text-amber-300 text-xs font-medium">Partial</span>
  return <span className="block text-center text-gray-600 text-xs">—</span>
}

function ComparisonSection() {
  return (
    <div className="mt-24">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-white/5 backdrop-blur px-3.5 py-1.5 text-xs font-medium text-orange-300 mb-4">
          <Sparkles className="h-3.5 w-3.5" /> How we compare
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Built for repair shops. Priced under the billing apps that aren't.
        </h2>
        <p className="text-gray-400 mt-4 max-w-2xl mx-auto">
          Generic GST billing apps don't track a single workorder. General-purpose ERPs
          weren't built for a repair counter. My Biz Flow is — at a fraction of what a
          dedicated repair-shop tool usually costs.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="text-left text-sm font-medium text-gray-400 pb-4 pr-4 align-bottom">Feature</th>
              {COMPARE_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`text-center pb-4 px-3 align-bottom ${
                    col.key === 'us' ? 'text-white' : 'text-gray-400'
                  }`}
                >
                  <span className={`text-sm font-semibold ${col.key === 'us' ? 'text-sky-300' : ''}`}>{col.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row, i) => (
              <tr key={row.feature} className={i % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                <td className="text-sm text-gray-300 py-3 pr-4 rounded-l-lg">{row.feature}</td>
                {COMPARE_COLUMNS.map((col) => {
                  const val = (row as any)[col.key]
                  return (
                    <td
                      key={col.key}
                      className={`py-3 px-3 text-center ${col.key === 'us' ? 'bg-sky-400/[0.06]' : ''} ${
                        col.key === 'us' && i === COMPARE_ROWS.length - 1 ? 'rounded-r-lg' : ''
                      }`}
                    >
                      {typeof val === 'string' ? (
                        <span className={`text-sm font-medium ${col.key === 'us' ? 'text-green-300' : 'text-gray-400'}`}>{val}</span>
                      ) : (
                        <CompareIcon value={val} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-center text-xs text-gray-500 mt-6 max-w-2xl mx-auto">
        Comparison based on each product's publicly listed features and pricing as of
        2026; feature sets and prices change over time — please verify current details
        directly with each provider before deciding.
      </p>
    </div>
  )
}
