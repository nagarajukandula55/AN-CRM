'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Input'

/**
 * Super-Admin-only audit list of every automated Telegram alert the system
 * has attempted to send (models/TelegramLog.ts) -- the "Telegram
 * notifications list" per explicit direction, complementing the message
 * wording/enable-disable editor at Settings > Platform (AN Group) >
 * Telegram Notification Templates.
 */

interface LogRow {
  _id: string
  businessName?: string
  type: string
  channel: 'TELEGRAM' | 'WHATSAPP'
  text: string
  sentToGroup: boolean
  sentToPersonal: boolean
  success: boolean
  createdAt: string
}

export default function TelegramNotificationsLogPage() {
  const [typeFilter, setTypeFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const params = new URLSearchParams()
  if (typeFilter) params.set('type', typeFilter)
  const { data, isLoading } = useSWR(
    `/api/admin/telegram-log${params.toString() ? `?${params.toString()}` : ''}`,
    (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())
  )
  const allLogs: LogRow[] = data?.success ? data.logs : []
  const logs = channelFilter ? allLogs.filter((l) => (l.channel || 'TELEGRAM') === channelFilter) : allLogs
  const types = Array.from(new Set(allLogs.map((l) => l.type))).sort()

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Notifications Log"
        description="Every automated Telegram/WhatsApp alert the system has attempted to send, newest first."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="max-w-xs">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All alert types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>
        <div className="max-w-xs">
          <Select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
            <option value="">All channels</option>
            <option value="TELEGRAM">Telegram</option>
            <option value="WHATSAPP">WhatsApp</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LoadingPanel label="Loading…" />
      ) : logs.length === 0 ? (
        <EmptyState kind="empty" title="No Telegram alerts sent yet" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-3 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5">When</th>
                  <th className="text-left px-4 py-2.5">Business</th>
                  <th className="text-left px-4 py-2.5">Type</th>
                  <th className="text-left px-4 py-2.5">Channel</th>
                  <th className="text-left px-4 py-2.5">Message</th>
                  <th className="text-left px-4 py-2.5">Destination</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l._id}>
                    <td className="px-4 py-2.5 tabular text-ink-2 whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-2.5 text-ink">{l.businessName || '—'}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone="neutral">{l.type}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={l.channel === 'WHATSAPP' ? 'success' : 'info'}>{l.channel === 'WHATSAPP' ? 'WhatsApp' : 'Telegram'}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-ink-2 max-w-xs truncate" title={l.text}>{l.text}</td>
                    <td className="px-4 py-2.5 text-ink-3">
                      {[l.sentToGroup && 'Group', l.sentToPersonal && 'Personal'].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={l.success ? 'success' : 'danger'}>{l.success ? 'Sent' : 'Failed / Skipped'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
