'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Notifications is no longer a page — it's the floating NotificationBell
 * icon available from every admin page (top-right, see
 * components/NotificationBell.tsx and AdminShell.tsx). This route is kept
 * as a redirect (not deleted outright) so any old bookmark/link to
 * /admin/notifications lands somewhere useful instead of 404ing.
 */
export default function NotificationsRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin')
  }, [router])
  return null
}
