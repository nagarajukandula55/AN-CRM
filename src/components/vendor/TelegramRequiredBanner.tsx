'use client'

/**
 * Persistent (non-dismissible-until-done) reminder shown across the
 * vendor portal until BOTH the personal Telegram chat AND the shop's own
 * group chat are linked -- Telegram is this platform's only support/
 * notification channel until a mobile app exists, per explicit direction
 * ("every user must use telegram... give quick link to navigate vendor
 * to link their telegram and also link their group both should be
 * done"). Deliberately a banner, not a hard redirect/lockout -- a vendor
 * mid-workorder shouldn't lose their place over this, but they're
 * reminded on every page until both are done. Same /vendor/telegram
 * destination handles connecting both, so one link covers whichever
 * (or both) are still missing.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Send, X } from 'lucide-react'

export default function TelegramRequiredBanner() {
  const [personalLinked, setPersonalLinked] = useState<boolean | null>(null)
  const [groupLinked, setGroupLinked] = useState<boolean | null>(null)
  const [dismissedThisSession, setDismissedThisSession] = useState(false)

  useEffect(() => {
    fetch('/api/vendor/telegram-routing')
      .then((r) => r.json())
      .then((d) => {
        setPersonalLinked(d.success ? !!d.telegramPersonalChatId : null)
        setGroupLinked(d.success ? !!d.telegramChatId : null)
      })
      .catch(() => {
        setPersonalLinked(null)
        setGroupLinked(null)
      })
  }, [])

  const missingPersonal = personalLinked === false
  const missingGroup = groupLinked === false
  if ((!missingPersonal && !missingGroup) || dismissedThisSession) return null

  const message =
    missingPersonal && missingGroup
      ? "Link your personal Telegram chat and your shop's group chat -- it's how we reach you (and your team) for support, alerts, and your daily business report (included in your plan)."
      : missingPersonal
      ? "Link your personal Telegram chat -- it's how we reach you for support, alerts, and your daily business report (included in your plan)."
      : "Link your shop's Telegram group too -- so your whole team gets alerts and daily reports, not just you."

  return (
    <div className="flex items-center gap-3 bg-warning-soft border-b border-warning/30 px-4 py-2 text-sm text-ink">
      <Send className="w-4 h-4 text-warning shrink-0" />
      <p className="flex-1">{message}</p>
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
