'use client'

import { useState } from 'react'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm p-8 md:p-10">
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-600">
                Action Required
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-gray-900 tracking-tight">Update your password</h1>
            <p className="mt-2 text-sm text-gray-500">
              Your password was reset by an administrator. Set a new one to continue.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
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
                <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    required
                    minLength={6}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-10 text-sm text-gray-900 outline-none focus:border-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gray-900 text-white text-sm font-medium py-2.5 hover:bg-gray-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
