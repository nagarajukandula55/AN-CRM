'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, AlertCircle, KeyRound } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      // The route always returns success:true (by design — it never reveals
      // whether the email matched an account), so this just flips the UI
      // into the "check your email" state.
      if (data.success) {
        setSent(true)
      } else {
        setError(data.message || 'Something went wrong. Please try again.')
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
              Reset your password
            </h1>
            <p className="mt-2 text-sm text-ink-3">
              Enter the email on your account and we&apos;ll send you a link to reset it.
            </p>
          </div>

          {sent ? (
            <div className="flex items-start gap-2.5 rounded-card border border-success/20 bg-success-soft px-4 py-3.5 text-sm text-success">
              <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                If an account exists for <strong>{email}</strong>, a reset link is on its way.
                Check your inbox — the link expires in 30 minutes.
              </span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-ink-3 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
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
                    Sending link…
                  </>
                ) : (
                  'Send reset link'
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
