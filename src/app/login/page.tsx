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

  const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
    google_not_configured: 'Sign in with Google isn\'t set up yet. Use your password instead.',
    google_no_account: 'No My Biz Flow account found for that Google account. Sign up first, or use your Vendor ID/password.',
    google_invalid_state: 'That sign-in link expired or was invalid. Please try again.',
    google_token_exchange_failed: 'Google sign-in failed. Please try again.',
    google_profile_failed: 'Could not read your Google profile. Please try again.',
    google_login_failed: 'Something went wrong signing in with Google. Please try again.',
    account_deactivated: 'This account has been deactivated. Contact your administrator.',
  }

  useEffect(() => {
    if (searchParams?.get('reason') === 'inactivity') setInactivityNotice(true)
    const errParam = searchParams?.get('error')
    if (errParam === 'admin_only') {
      setError('This domain is reserved for platform administrators. Use the regular login if you\'re a vendor.')
    } else if (errParam && GOOGLE_ERROR_MESSAGES[errParam]) {
      setError(GOOGLE_ERROR_MESSAGES[errParam])
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

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-ink-3">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <a
            href="/api/auth/google/start"
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-control border border-border-strong bg-surface px-4 py-3 text-sm font-medium text-ink hover:bg-surface-2 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.6 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z"/>
              <path fill="#4CAF50" d="M24 44c5.4 0 10.2-1.8 13.9-5.1l-6.4-5.4C29.4 35.4 26.8 36 24 36c-5.2 0-9.7-3.1-11.3-7.4l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.4 5.4C40.4 36.4 44 30.8 44 24c0-1.3-.1-2.7-.4-3.5z"/>
            </svg>
            Sign in with Google
          </a>

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
