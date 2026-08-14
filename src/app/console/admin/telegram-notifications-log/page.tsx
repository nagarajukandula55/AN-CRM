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
  text: string
  sentToGroup: boolean
  sentToPersonal: boolean
  success: boolean
  createdAt: string
}

export default function TelegramNotificationsLogPage() {
  const [typeFilter, setTypeFilter] = useState('')
  const { data, isLoading } = useSWR(
    `/api/admin/telegram-log${typeFilter ? `?type=${encodeURIComponent(typeFilter)}` : ''}`,
    (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())
  )
  const logs: LogRow[] = data?.success ? data.logs : []
  const types = Array.from(new Set(logs.map((l) => l.type))).sort()

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Telegram Notifications Log"
        description="Every automated Telegram alert the system has attempted to send, newest first."
      />

      <div className="mb-4 max-w-xs">
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All alert types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
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
