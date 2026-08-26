'use client'

/**
 * Replaces the standalone notification bell in the vendor portal --
 * per explicit direction ("system wide notification should show as pop
 * and i don't think bell is required just show them as popup because
 * this bell also takes time"). Polls for unread notifications and surfaces
 * each one as a toast (via the app-wide ToastProvider) the moment it's
 * seen, then marks it read -- no click-to-open panel required. The
 * underlying Notification model/API (api/notifications, notifyUser())
 * is unchanged; this is just a different way of surfacing the same data.
 */

import { useEffect, useRef } from 'react'
import { useToast } from '@/components/shared/Toast'

interface NotificationItem {
  _id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  isRead: boolean
  createdAt: string
}

const POLL_MS = 20000

export default function NotificationToaster() {
  const toast = useToast()
  // Tracks ids already toasted THIS session -- a poll can re-fetch the
  // same still-unread row before the mark-read PATCH lands; without this
  // guard the same event could pop up twice.
  const toastedIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    function poll() {
      fetch('/api/notifications')
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return
          const items: NotificationItem[] = d?.notifications || []
          for (const n of items) {
            if (n.isRead || toastedIds.current.has(n._id)) continue
            toastedIds.current.add(n._id)
            toast.show(n.type, `${n.title}${n.message ? ` — ${n.message}` : ''}`)
            fetch(`/api/notifications/${n._id}/read`, { method: 'PATCH' }).catch(() => {})
          }
        })
        .catch(() => {})
    }

    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
