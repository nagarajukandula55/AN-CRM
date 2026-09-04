'use client'
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

/**
 * Shared pricing FAQ -- shown on both /pricing and the home page (per
 * explicit direction to put the FAQ on the home page too), one source of
 * truth so the two never drift apart.
 */

const FAQ_ITEMS: { q: string; a: ReactNode }[] = [
  { q: 'Is there a free trial?', a: 'Yes — every plan includes a 15-day free trial with full product access, no card required.' },
  { q: 'Is GST included in these prices?', a: 'No. Every price shown here is exclusive of GST — 18% GST is added at checkout, shown clearly before you pay.' },
  { q: 'What happens after my trial ends?', a: "Your data is never deleted. Once the trial ends you'll need to choose a plan to keep using the portal — nothing is lost in the meantime." },
  { q: 'If I subscribe now, will my price change later?', a: "No. Whatever rate you're charged when you subscribe is locked in for that paid term (yearly or 2-yearly). Only a future renewal, purchased after your current term ends, would use whatever the standard rate is at that time." },
  { q: 'Will founding/launch pricing last forever?', a: 'No — it applies to new subscriptions purchased before the founding period ends. After that, new customers are charged the standard rate. Anyone who already subscribed during the founding period keeps that rate for the term they paid for.' },
  { q: 'Can I use this for multiple service centers?', a: 'Yes, on the Ultimate plan — unlimited sub-vendor/multi-center hierarchy under one login, with centralized reporting.' },
  { q: 'Are there per-user or per-seat charges?', a: "No. Pricing is per plan, not per user — Starter and Pro are single-login, Ultimate covers unlimited centers each with their own login, at no extra per-seat cost." },
  { q: 'Can I cancel?', a: <>Yes, any time from Plan &amp; Billing — cancellation stops future billing, but subscription fees already paid are non-refundable. See our <Link href="/refund-policy" className="underline hover:text-gray-300">Cancellation Policy</Link> for details.</> },
]

export function PricingFaq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="mt-24 max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Pricing FAQ</h2>
      </div>
      <div className="space-y-2">
        {FAQ_ITEMS.map((item, i) => (
          <div key={item.q} className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-white"
            >
              {item.q}
              <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <p className="px-5 pb-4 text-sm text-gray-400 leading-relaxed">{item.a}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
