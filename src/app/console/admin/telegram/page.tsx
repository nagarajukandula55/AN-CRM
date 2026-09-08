'use client'

/**
 * Merged "Telegram" admin page -- combines four formerly separate nav
 * entries (Telegram Users, Telegram Notifications Log, Telegram Chat IDs,
 * Telegram Broadcast) into one page with tabs, per explicit direction to
 * reduce Admin nav clutter by merging related tools ("wherever we can").
 * Same components/logic that used to live at their own routes; those
 * routes now just redirect here.
 */

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/ui/PageHeader'
import TelegramUsersPanel from './TelegramUsersPanel'
import TelegramIdsPanel from './TelegramIdsPanel'
import TelegramLogPanel from './TelegramLogPanel'
import TelegramBroadcastPanel from './TelegramBroadcastPanel'

type TabKey = 'users' | 'chat-ids' | 'log' | 'broadcast'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'users', label: 'Users & Groups' },
  { key: 'chat-ids', label: 'Chat IDs' },
  { key: 'log', label: 'Notifications Log' },
  { key: 'broadcast', label: 'Broadcast' },
]

function TelegramAdminInner() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabKey) || 'users'
  const [tab, setTab] = useState<TabKey>(TABS.some((t) => t.key === initialTab) ? initialTab : 'users')

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Telegram"
        description="Everyone who has messaged the bot, every vendor's chat IDs, the automated-alert log, and the connect-reminder broadcast — all in one place."
      />

      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-3 hover:text-ink-2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && <TelegramUsersPanel />}
      {tab === 'chat-ids' && <TelegramIdsPanel />}
      {tab === 'log' && <TelegramLogPanel />}
      {tab === 'broadcast' && <TelegramBroadcastPanel />}
    </div>
  )
}

export default function TelegramAdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <TelegramAdminInner />
    </Suspense>
  )
}
