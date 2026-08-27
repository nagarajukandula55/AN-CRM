'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Clock, ShieldCheck, Smartphone, KeyRound } from 'lucide-react'

// Shared by both login paths (password and phone OTP) -- identical rule
// either way, so a vendor logging in with OTP lands in exactly the same
// place a password login would have sent them.
function resolveLandingPage(user: any): string {
  return user?.mustChangePassword
    ? '/update-password'
    : user?.pendingVendorApplication ? '/vendor-application-status'
    : user?.isMinimalOnly ? 'https://shopnative.in'
    : user?.hasVendorAccess && user?.vendorAppliedAs === 'SC' && !user?.isEngineerOrCco
    ? '/console'
    : user?.hasVendorAccess ? (user?.isEngineerOrCco ? '/vendor/crm' : '/vendor')
    : user?.homeRoute ? user.homeRoute
    : user?.role === 'VENDOR' ? '/vendor' : '/console'
}

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
    if (searchParams?.get('error') === 'admin_only') {
      setError('This domain is reserved for platform administrators. Use the regular login if you\'re a vendor.')
    }
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

      // Hard redirect so the browser commits the httpOnly cookie before the next request.
      // router.push() triggers an RSC fetch that races with cookie propagation → 307 loop.
      window.location.href = resolveLandingPage(data.user)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Phone-OTP login -- alternative to password, per explicit direction
  // ("confirm me the possibility of logging with other ways and means
  // also instead of just vendor id... work on that phone and OTP").
  // Fully wired end to end; every send will fail with a clear
  // "not configured" message until a real SMS gateway is set up in env
  // (see services/sms/smsClient.service.ts's own comment) -- that's a
  // real business step (SMS gateway account + a DLT-registered OTP
  // template, mandatory in India), not something this UI can complete
  // on its own.
  const [mode, setMode] = useState<'password' | 'otp'>('password')
  const [otpPhone, setOtpPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone')
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpError, setOtpError] = useState('')

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setOtpError('')
    setOtpSending(true)
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: otpPhone }),
      })
      const data = await res.json()
      if (!data.success) {
        setOtpError(data.message || 'Failed to send OTP')
        return
      }
      setOtpStep('code')
    } catch {
      setOtpError('Network error. Please try again.')
    } finally {
      setOtpSending(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setOtpError('')
    setOtpVerifying(true)
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: otpPhone, otp: otpCode }),
      })
      const data = await res.json()
      if (!data.success) {
        setOtpError(data.message || 'Incorrect OTP')
        return
      }
      localStorage.setItem('an_token', data.token)
      localStorage.setItem('an_user', JSON.stringify(data.user))
      window.location.href = resolveLandingPage(data.user)
    } catch {
      setOtpError('Network error. Please try again.')
    } finally {
      setOtpVerifying(false)
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
              Run your service center from one account.
            </p>
          </div>

          <div className="mb-6 inline-flex rounded-control border border-border bg-surface-2 p-1 gap-1">
            <button
              type="button"
              onClick={() => setMode('password')}
              className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'password' ? 'bg-accent text-accent-fg' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <KeyRound size={13} /> Password
            </button>
            <button
              type="button"
              onClick={() => setMode('otp')}
              className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'otp' ? 'bg-accent text-accent-fg' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <Smartphone size={13} /> Phone OTP
            </button>
          </div>

          {mode === 'otp' ? (
            <form onSubmit={otpStep === 'phone' ? handleSendOtp : handleVerifyOtp} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-ink-3 mb-2">Mobile Number</label>
                <input
                  type="tel"
                  value={otpPhone}
                  onChange={(e) => setOtpPhone(e.target.value)}
                  placeholder="98765 43210"
                  required
                  disabled={otpStep === 'code'}
                  autoFocus
                  className="w-full rounded-control border border-border-strong bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft transition-all disabled:opacity-60"
                />
              </div>

              {otpStep === 'code' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-ink-3">6-digit code</label>
                    <button
                      type="button"
                      onClick={() => { setOtpStep('phone'); setOtpCode(''); setOtpError('') }}
                      className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                    >
                      Change number
                    </button>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    required
                    autoFocus
                    className="w-full rounded-control border border-border-strong bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-3 tracking-[0.3em] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft transition-all"
                  />
                </div>
              )}

              {otpError && (
                <div className="rounded-control border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
                  {otpError}
                </div>
              )}

              <button
                type="submit"
                disabled={otpSending || otpVerifying}
                className="w-full rounded-control bg-accent px-4 py-3 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {otpSending || otpVerifying ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {otpStep === 'phone' ? 'Sending…' : 'Verifying…'}
                  </>
                ) : otpStep === 'phone' ? (
                  'Send OTP'
                ) : (
                  'Verify & Sign In'
                )}
              </button>
            </form>
          ) : (
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email / Username */}
            <div>
              <label className="block text-xs font-medium text-ink-3 mb-2">Email or Vendor ID</label>
              <input
                type="text"
                value={form.identifier}
                onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                placeholder="you@company.com or VND0001"
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
          )}

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
