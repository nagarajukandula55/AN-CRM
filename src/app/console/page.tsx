'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * Console's own dashboard is now type-specific (see console/sc/dashboard,
 * console/admin/dashboard) -- this route is purely a router that sends
 * the user to the right one, so every internal link/bookmark to plain
 * "/console" keeps working.
 *
 * Routes off /api/vendor/type-context's live `appliedAs` (a direct DB
 * lookup via resolveVendorContext, recomputed on every call) rather than
 * matching activeBusinessId against the businesses[] list from /api/auth/me
 * -- that match kept failing for accounts whose session was issued before
 * a fix landed, or whose businesses[] list didn't include their own
 * vendor-owned business yet, silently dumping a real SC vendor onto the
 * generic Admin dashboard. appliedAs has no such staleness window --
 * it's resolved fresh on every request, not baked into a token.
 *
 * BRAND/POS vendor types were removed from this app (SC-only platform
 * now) -- any account still carrying a legacy BRAND/POS appliedAs in the
 * database falls through to the Admin dashboard rather than a route that
 * no longer exists.
 */
export default function ConsoleRouter() {
  const router = useRouter()

  useEffect(() => {
    fetch('/api/vendor/type-context')
      .then((r) => r.json())
      .then((d) => {
        if (d.appliedAs === 'SC') router.replace('/console/sc/dashboard')
        else router.replace('/console/admin/dashboard')
      })
      .catch(() => router.replace('/console/admin/dashboard'))
  }, [router])

  return (
    <div className="min-h-screen bg-bg">
      <LoadingPanel label="Loading your dashboard…" />
    </div>
  )
}
