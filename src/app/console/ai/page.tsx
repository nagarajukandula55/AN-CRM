'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * ANu is no longer a page — it's the floating AnuWidget available from
 * every admin page (bottom-left icon, see components/AnuWidget.tsx and
 * AdminShell.tsx). This route is kept as a redirect (not deleted outright)
 * so any old bookmark/link to /console/ai lands somewhere useful instead of
 * 404ing.
 */
export default function AiRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/console')
  }, [router])
  return null
}
