'use client'

import { useState } from 'react'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

/**
 * Forced password-change gate. Reached either by direct login redirect
 * (see login/page.tsx) or by middleware bouncing every other request here
 * while User.mustChangePassword is set (super-admin reset/temp password —
 * see api/admin/users/[id]/reset-password). The user's current password
 * IS the temp/reset one; this just reuses the normal change-password route.
 */
export default function UpdatePasswordPage() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.next !== form.confirm) {
      setError('New passwords do not match')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      })
      const d = await res.json()
      if (!d.success) {
        setError(d.message || 'Failed to update password')
        return
      }
      // change-password does not reissue the cookie -- the old JWT still
      // carries mustChangePassword: true, so the only way forward is a
      // fresh login, same as any other password change in this app.
      window.location.href = '/login'
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        <div className="rounded-card border border-border bg-surface shadow-card p-8 md:p-10">
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning-soft px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-warning" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-warning">
                Action Required
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-ink tracking-tight">Update your password</h1>
            <p className="mt-2 text-sm text-ink-3">
              Your password was reset by an administrator. Set a new one to continue.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-control border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: 'Current (temporary) Password', key: 'current' as const },
              { label: 'New Password', key: 'next' as const },
              { label: 'Confirm New Password', key: 'confirm' as const },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="text-xs text-ink-3 mb-1 block">{label}</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    required
                    // Only the NEW password needs a minimum length -- the
                    // current one is whatever it already is (a temp
                    // password like "admin" can be shorter than 6 and
                    // still needs to be typeable here to authenticate the
                    // change). Was applied to all three fields, which
                    // blocked submitting the form entirely whenever the
                    // current password was under 6 characters.
                    minLength={key === 'current' ? undefined : 6}
                    className="w-full rounded-control border border-border bg-surface px-3 py-2.5 pr-10 text-sm text-ink outline-none focus:border-border-strong"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
                  >
                    {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-control bg-accent text-accent-fg text-sm font-medium py-2.5 hover:bg-accent-hover transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Spinner size={16} /> : null}
              {loading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
