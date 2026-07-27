'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import HomePage from '@/components/marketing/HomePage'

/**
 * Root page — for an authenticated visitor this resolves the same
 * role/vendor-aware landing page the login form redirects to (see
 * /api/auth/landing) and sends them straight there, exactly as before.
 * "/" is now public in middleware (see src/middleware.ts), so an
 * unauthenticated visitor no longer bounces to /login before ever seeing
 * anything -- instead /api/auth/landing 401s (no an_token cookie / no
 * valid session), and we render the public marketing homepage in place
 * of a redirect.
 */
export default function RootPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'checking' | 'anonymous'>('checking')

  useEffect(() => {
    let cancelled = false

    fetch('/api/auth/landing')
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return
        if (ok && d.success && d.landingPath) {
          const path = d.landingPath as string
          // landingPath can be an external URL (shopnative.in) -- router.replace
          // only handles internal paths, so an external target needs a real
          // navigation instead.
          if (path.startsWith('http')) window.location.href = path
          else router.replace(path)
          return
        }
        // No valid session -- show the public marketing homepage instead
        // of redirecting anywhere.
        setStatus('anonymous')
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous')
      })

    return () => {
      cancelled = true
    }
  }, [router])

  if (status === 'anonymous') {
    return <HomePage />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    </div>
  )
}
