'use client'

/**
 * Persistent (non-dismissible) reminder shown across the vendor portal
 * until a personal Telegram chat is linked -- Telegram is this platform's
 * only support/notification channel until a mobile app exists, per
 * explicit direction ("every user must use telegram as that is our way of
 * communication till we receive mobile application"). Deliberately a
 * banner, not a hard redirect/lockout -- a vendor mid-workorder shouldn't
 * lose their place over this, but they're reminded on every page until
 * it's done.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Send, X } from 'lucide-react'

export default function TelegramRequiredBanner() {
  const [linked, setLinked] = useState<boolean | null>(null)
  const [dismissedThisSession, setDismissedThisSession] = useState(false)

  useEffect(() => {
    fetch('/api/vendor/telegram-routing')
      .then((r) => r.json())
      .then((d) => setLinked(d.success ? !!d.telegramPersonalChatId : null))
      .catch(() => setLinked(null))
  }, [])

  if (linked !== false || dismissedThisSession) return null

  return (
    <div className="flex items-center gap-3 bg-warning-soft border-b border-warning/30 px-4 py-2 text-sm text-ink">
      <Send className="w-4 h-4 text-warning shrink-0" />
      <p className="flex-1">
        Link your personal Telegram chat -- it's how we reach you for support, alerts, and reports until the mobile app is ready.
      </p>
      <Link href="/vendor/telegram" className="font-medium text-accent hover:underline shrink-0">
        Connect now
      </Link>
      <button
        onClick={() => setDismissedThisSession(true)}
        aria-label="Dismiss for this session"
        className="text-ink-3 hover:text-ink shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
