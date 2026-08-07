'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingPanel } from '@/components/ui/Spinner'
import { getAuthMe } from '@/lib/authMeCache'

/**
 * Console's own dashboard is now type-specific (see console/sc/dashboard,
 * console/pos/dashboard, console/brand/dashboard, console/admin/dashboard) --
 * this route is purely a router that inspects the active business's
 * operatingMode and sends the user to the right one, so every internal
 * link/bookmark to plain "/console" keeps working.
 */
export default function ConsoleRouter() {
  const router = useRouter()

  useEffect(() => {
    getAuthMe().then((meData: any) => {
      const user = meData?.user ?? meData
      // A real tenant business's own type wins over a generic platform-
      // staff shortcut -- some staff accounts also hold a vendor's own
      // Owner/Manager role (isPlatformStaff can be true from an unrelated
      // broad permission grant), so checking isPlatformStaff FIRST landed
      // an actual SC/POS/Brand vendor on the generic Admin dashboard
      // instead of their own, found live. Only fall through to Admin when
      // the active business has no real operating type at all (a genuine
      // platform-only account, or a business that hasn't been configured
      // as Brand/SC/POS yet).
      const activeBiz = (meData?.businesses ?? []).find((b: any) => b._id === user?.activeBusinessId)
      const mode = activeBiz?.operatingMode || ''
      if (mode === 'SC') router.replace('/console/sc/dashboard')
      else if (mode === 'POS') router.replace('/console/pos/dashboard')
      else if (mode === 'BRAND') router.replace('/console/brand/dashboard')
      else router.replace('/console/admin/dashboard')
    }).catch(() => router.replace('/console/admin/dashboard'))
  }, [router])

  return (
    <div className="min-h-screen bg-bg">
      <LoadingPanel label="Loading your dashboard…" />
    </div>
  )
}
