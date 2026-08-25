'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, ArrowLeft, CheckCircle, AlertCircle, KeyRound } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams?.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('This reset link is missing its token. Please request a new one.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      })
      const data = await res.json()
      if (data.success) {
        setDone(true)
        setTimeout(() => router.push('/login'), 2000)
      } else {
        setError(data.message || 'This reset link is invalid or has expired')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 h-80 w-80 rounded-full bg-info-soft/30 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-card border border-border bg-surface shadow-card p-8 md:p-10">
          <div className="mb-8">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-card bg-accent-soft border border-accent/20 mb-4">
              <KeyRound className="h-5 w-5 text-accent" />
            </div>
            <h1 className="text-2xl font-semibold text-ink tracking-tight">
              Set a new password
            </h1>
            <p className="mt-2 text-sm text-ink-3">
              Choose a new password for your account. This link can only be used once.
            </p>
          </div>

          {done ? (
            <div className="flex items-start gap-2.5 rounded-card border border-success/20 bg-success-soft px-4 py-3.5 text-sm text-success">
              <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
              Password reset successfully. Redirecting you to sign in…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {!token && (
                <div className="flex items-center gap-2 rounded-card border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  No reset token found in this link.
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-ink-3 mb-2">New password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus
                    className="w-full rounded-card border border-border bg-surface px-4 py-3 pr-12 text-sm text-ink placeholder:text-ink-3 focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border transition-all"
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

              <div>
                <label className="block text-xs font-medium text-ink-3 mb-2">Confirm password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                  className="w-full rounded-card border border-border bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-3 focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border transition-all"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-card border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-card bg-accent px-4 py-3 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Spinner size={16} />
                    Resetting…
                  </>
                ) : (
                  'Reset password'
                )}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-ink-3">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink-2 transition-colors">
            <ArrowLeft size={14} />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
