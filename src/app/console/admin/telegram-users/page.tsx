'use client'

import useSWR from 'swr'
import { User, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * Super Admin directory of every Telegram chat (personal or group) that
 * has ever messaged the bot, read live from central-api's "telegram_users"
 * dataset (see api/telegram/users/route.ts) -- central-api records this
 * directly since it sees every update before relaying it anywhere, so
 * this app no longer keeps its own local copy. Distinct from any one
 * business's Settings > Telegram Chat ID field: this is the platform-wide,
 * cross-site view of everyone who has ever touched the bot, whether or
 * not they've linked a business yet. Has no "linked business" column --
 * central-api has no visibility into that, it only exists in each site's
 * own database.
 */

interface TelegramUserRow {
  _id: string
  chatId: string
  chatType: 'private' | 'group' | 'supergroup' | 'channel'
  firstName?: string
  lastName?: string
  username?: string
  title?: string
  lastCommand?: string
  messageCount: number
  firstSeenAt: string
  lastSeenAt: string
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function TelegramUsersPage() {
  const { data, isLoading } = useSWR('/api/telegram/users')
  const users: TelegramUserRow[] = data?.success ? data.users || [] : []

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Telegram Users &amp; Groups"
        description="Every chat that has ever messaged the bot, linked or not"
      />

      {isLoading ? (
        <LoadingPanel label="Loading…" />
      ) : users.length === 0 ? (
        <EmptyState kind="empty" title="No Telegram contacts yet" description="Nobody has messaged the bot yet." />
      ) : (
        <Card className="overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-ink-3 font-medium eyebrow">Contact</th>
                <th className="text-left px-5 py-3 text-ink-3 font-medium eyebrow">Chat ID</th>
                <th className="text-left px-5 py-3 text-ink-3 font-medium eyebrow">Type</th>
                <th className="text-left px-5 py-3 text-ink-3 font-medium eyebrow">Messages</th>
                <th className="text-left px-5 py-3 text-ink-3 font-medium eyebrow">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => {
                const isGroup = u.chatType === 'group' || u.chatType === 'supergroup'
                return (
                  <tr key={u._id} className="hover:bg-surface-2 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {isGroup ? <Users className="w-4 h-4 text-ink-3" /> : <User className="w-4 h-4 text-ink-3" />}
                        <div>
                          <p className="font-medium text-ink">
                            {isGroup ? (u.title || 'Untitled group') : [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unknown'}
                          </p>
                          {u.username && <p className="text-xs text-ink-3">@{u.username}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 tabular text-ink-2">{u.chatId}</td>
                    <td className="px-5 py-3">
                      <Badge tone={isGroup ? 'info' : 'neutral'}>{u.chatType}</Badge>
                    </td>
                    <td className="px-5 py-3 tabular text-ink-2">{u.messageCount}</td>
                    <td className="px-5 py-3 text-ink-2">{fmtDate(u.lastSeenAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
