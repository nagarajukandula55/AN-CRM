'use client'

import { useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'

/**
 * SessionGuard — mounted once in the root layout, applies to every page.
 *
 * Inactivity auto-logout: if the user does not click, type, scroll, move
 * the mouse, or touch the screen for INACTIVITY_LIMIT_MS, the session is
 * logged out automatically and the user is redirected to /login with a
 * reason so the login page can explain why they landed there.
 *
 * Previously this component ALSO rendered a fixed bottom-right floating
 * "Logout" button on every authenticated page. That duplicated the real
 * sign-out control already in Sidebar's footer and — per a live report —
 * sat fixed at bottom-right with z-[60], overlapping/interrupting other
 * bottom-right UI (e.g. dialogs, action bars, chat widgets). Removed here;
 * Sidebar's own footer logout button is the one and only sign-out control.
 *
 * Skipped on pre-auth / public routes (login, register, the public
 * vendor-application form, the public storefront, and public token-shared
 * invoice links) since there is no session to guard there.
 */

const INACTIVITY_LIMIT_MS = 60 * 60 * 1000 // 1 hour

const EXCLUDED_PREFIXES = [
  '/login',
  '/register',
  '/vendor-apply',
  '/products',
  '/invoice/view',
]

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
] as const

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export default function SessionGuard() {
  const pathname = usePathname() || '/'
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const excluded = isExcluded(pathname)

  const logout = useCallback(
    async (reason?: string) => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' })
      } catch {
        /* proceed to redirect regardless */
      }
      try {
        localStorage.removeItem('an_token')
        localStorage.removeItem('an_user')
      } catch {
        /* ignore */
      }
      const suffix = reason ? `?reason=${reason}` : ''
      window.location.href = `/login${suffix}`
    },
    []
  )

  useEffect(() => {
    if (excluded) return

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        logout('inactivity')
      }, INACTIVITY_LIMIT_MS)
    }

    resetTimer()
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, resetTimer, { passive: true })
    )

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer))
    }
  }, [excluded, logout])

  return null
}
