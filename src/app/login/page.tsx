'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Clock, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inactivityNotice, setInactivityNotice] = useState(false)

  useEffect(() => {
    if (searchParams?.get('reason') === 'inactivity') setInactivityNotice(true)
  }, [searchParams])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.identifier,
          username: form.identifier,
          password: form.password,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.message || 'Login failed')
        return
      }

      // Store token in localStorage for client-side access
      localStorage.setItem('an_token', data.token)
      localStorage.setItem('an_user', JSON.stringify(data.user))

      // Was always '/console' regardless of role -- a vendor login (User.role
      // === 'VENDOR') has no business being dropped onto the internal admin
      // shell; their actual portal (product wizard, orders, staff, payouts)
      // lives under /vendor. Every other role keeps landing on /console.
      // A super-admin reset/temp password forces this gate first --
      // middleware itself blocks everything else until it's cleared, so
      // landing anywhere else would just bounce right back here.
      // Minimal-floor-only accounts (shopnative/angroup self-registrations
      // with no AN staff/vendor role) have no admin-panel business at all --
      // send them to their actual storefront instead.
      const landingPage = data.user?.mustChangePassword
        ? '/update-password'
        // Applied as a vendor but no BusinessMember yet (review pending, or
        // instant-trial activation hasn't landed) -- show them their
        // application status here instead of bouncing to shopnative.in.
        : data.user?.pendingVendorApplication ? '/vendor-application-status'
        : data.user?.isMinimalOnly ? 'https://shopnative.in'
        // A vendor's own Owner/Manager belongs on /vendor regardless of
        // homeRoute -- they can ALSO hold an unrelated business-wide role
        // (e.g. a generic "Manager" role granted just to get vendor-
        // Manager-equivalent access) whose own homeRoute was configured
        // for a totally different use case, and was winning here instead.
        // Engineer/CCO are vendor-team members too (same hasVendorAccess
        // gate), but /vendor's own root page is a generic Owner/Manager
        // sales dashboard -- irrelevant to their role. Send them to the
        // CRM-specific overview instead; Owner/Manager keep landing on
        // plain /vendor exactly as before.
        // SC vendors have no vendor-portal experience -- they work in the
        // console app instead, landing on its Dashboard same as any other
        // console user (NOT jumping straight to the workorder screen --
        // that's reached via the sidebar's Workorders link, which is
        // itself pointed at the SC-specific page for these users, see
        // sidebar-nav.ts/sidebar.tsx). Only for the Owner/Manager landing
        // fresh in (isEngineerOrCco already goes to /vendor/crm, unaffected).
        : data.user?.hasVendorAccess && data.user?.vendorAppliedAs === 'SC' && !data.user?.isEngineerOrCco
        ? '/console'
        : data.user?.hasVendorAccess ? (data.user?.isEngineerOrCco ? '/vendor/crm' : '/vendor')
        // Per-role configurable home page (Roles & Permissions > Home Page)
        // wins over the generic role/account-type default below when set.
        : data.user?.homeRoute ? data.user.homeRoute
        : data.user?.role === 'VENDOR' ? '/vendor' : '/console'

      // Hard redirect so the browser commits the httpOnly cookie before the next request.
      // router.push() triggers an RSC fetch that races with cookie propagation → 307 loop.
      window.location.href = landingPage
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 h-80 w-80 rounded-full bg-info-soft blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-card border border-border bg-surface shadow-card p-8 md:p-10">
          {/* AN-CRM is its own standalone product -- this used to carry
              over ANgroup's "shared identity across every AN Group app"
              SSO framing verbatim, which made AN-CRM's own login page
              read as ANgroup's. Branded as AN-CRM's own sign-in instead. */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent-soft px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                My Biz Flow
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-ink tracking-tight">Sign in</h1>
            <p className="mt-2 text-sm text-ink-3">
              Brand · Service Center · POS, in one account.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email / Username */}
            <div>
              <label className="block text-xs font-medium text-ink-3 mb-2">Email</label>
              <input
                type="text"
                value={form.identifier}
                onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                placeholder="you@company.com"
                required
                autoFocus
                className="w-full rounded-control border border-border-strong bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-ink-3">Password</label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-control border border-border-strong bg-surface px-4 py-3 pr-12 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-2 transition"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Inactivity notice */}
            {inactivityNotice && !error && (
              <div className="flex items-center gap-2 rounded-control border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning">
                <Clock size={15} className="flex-shrink-0" />
                You were signed out after 1 hour of inactivity. Please sign in again.
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-control border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-control bg-accent px-4 py-3 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-ink-3 text-center">
              Secured by My Biz Flow
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-ink-3">
          Don&apos;t have an account?{' '}
          <Link href="/partner-signup" className="font-medium text-accent hover:text-accent-hover transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
