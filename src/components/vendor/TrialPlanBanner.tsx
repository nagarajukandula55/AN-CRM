'use client'

/**
 * Reminder for vendors who have never actually purchased a plan (no PAID
 * VendorBillingInvoice exists yet -- covers both the free 7-day trial and
 * an expired trial with no purchase since) -- plan selection now happens
 * post-login instead of at signup, so this is the nudge that replaces the
 * old signup-time plan picker. A floating collapsible tab pinned to the
 * right edge (not a top banner) so it never pushes page content down or
 * covers a header action -- collapses to a slim edge tab, expands to a
 * small card on click. Collapse state is per-browser only (localStorage),
 * not a real dismissal, since payment is still outstanding.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CreditCard, ChevronLeft, ChevronRight } from 'lucide-react'

const STORAGE_KEY = 'an_trial_banner_collapsed'

export default function TrialPlanBanner() {
  const [state, setState] = useState<{ show: boolean; daysLeft: number | null; expired: boolean } | null>(null)
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) !== '0')
    } catch {
      // ignore -- default collapsed
    }
    fetch('/api/vendor/billing')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return setState(null)
        const hasPaid = (d.invoices || []).some((inv: any) => inv.status === 'PAID')
        if (hasPaid) return setState({ show: false, daysLeft: null, expired: false })
        const end = d.subscription?.currentPeriodEnd ? new Date(d.subscription.currentPeriodEnd) : null
        const expired = d.status === 'EXPIRED' || d.status === 'NOT_SET' || (end ? end.getTime() < Date.now() : true)
        const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : null
        setState({ show: true, daysLeft: expired ? null : daysLeft, expired })
      })
      .catch(() => setState(null))
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  }

  if (!state?.show) return null

  return (
    <div className="fixed right-0 top-1/3 z-40 flex items-start">
      {collapsed ? (
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 rounded-l-control border border-r-0 border-info/30 bg-info-soft px-2 py-3 text-info shadow-card [writing-mode:vertical-rl]"
          aria-label="Show plan reminder"
        >
          <CreditCard className="w-4 h-4 rotate-90" />
          <span className="text-xs font-medium">{state.expired ? 'Trial ended' : 'Free trial'}</span>
          <ChevronLeft className="w-3.5 h-3.5 rotate-90" />
        </button>
      ) : (
        <div className="w-64 rounded-l-card border border-r-0 border-info/30 bg-surface shadow-card-lg p-4">
          <div className="flex items-start justify-between gap-2">
            <CreditCard className="w-4 h-4 text-info shrink-0 mt-0.5" />
            <button
              onClick={toggle}
              aria-label="Collapse"
              className="text-ink-3 hover:text-ink shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2 text-sm text-ink">
            {state.expired
              ? 'Your free trial has ended — purchase a plan to keep using your portal.'
              : `You're on a free trial${state.daysLeft !== null ? ` — ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'} left` : ''}.`}
          </p>
          <Link
            href="/vendor/billing"
            className="mt-3 inline-block rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            View plans
          </Link>
        </div>
      )}
    </div>
  )
}
