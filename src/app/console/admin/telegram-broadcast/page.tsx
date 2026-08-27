'use client'

/**
 * Super-admin tool: see which vendors still haven't connected Telegram
 * (the only channel this platform uses for support/alerts/reports until a
 * mobile app exists), and send a one-click reminder email to exactly
 * those vendors -- each with a genuine one-tap deep link into Telegram
 * (server-mints their link code, same mechanism the vendor's own "Connect"
 * button uses), not just a generic "go log in" nudge. Per explicit
 * direction ("i want to ask all signed up users to connect their telegram
 * to bot and add to group as well... we also can show them the results").
 */

import { useState } from 'react'
import useSWR from 'swr'
import { Send, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface VendorRow {
  vendorId?: string
  companyName: string
  email: string
  personalConnected: boolean
  groupConnected: boolean
}

export default function TelegramBroadcastPage() {
  const { data, isLoading, mutate } = useSWR<{ success: boolean; vendors: VendorRow[]; total: number; connected: number; notConnected: number }>(
    '/api/admin/telegram-broadcast'
  )
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ targeted: number; sentCount: number; failures: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const vendors = data?.vendors || []

  async function handleSend() {
    setSending(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/telegram-broadcast/send', { method: 'POST' })
      const d = await res.json()
      if (!d.success) {
        setError(d.message || 'Failed to send broadcast')
        return
      }
      setResult({ targeted: d.targeted, sentCount: d.sentCount, failures: d.failures || [] })
      mutate()
    } catch {
      setError('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6 space-y-6">
      <PageHeader
        title="Telegram Broadcast"
        description="Remind every vendor who hasn't connected Telegram yet — support, alerts, and business reports all depend on it."
        actions={
          <Button onClick={handleSend} disabled={sending || (data?.notConnected ?? 0) === 0} loading={sending} icon={<Send className="h-4 w-4" />}>
            Send Reminder to Unconnected
          </Button>
        }
      />

      {error && <div className="rounded-control border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      {result && (
        <Card className="p-4 border-success/30 bg-success-soft">
          <div className="flex items-center gap-2 text-success font-medium mb-1">
            <CheckCircle2 className="h-4 w-4" /> Broadcast sent
          </div>
          <p className="text-sm text-ink-2">
            {result.sentCount} of {result.targeted} reminder emails sent successfully.
            {result.failures.length > 0 && ` ${result.failures.length} failed.`}
          </p>
          {result.failures.length > 0 && (
            <ul className="mt-2 text-xs text-ink-3 list-disc list-inside">
              {result.failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Spinner size={24} /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-xs text-ink-3">Total Active Vendors</p>
              <p className="tabular text-2xl font-bold text-ink">{data?.total ?? 0}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-3">Connected</p>
              <p className="tabular text-2xl font-bold text-success">{data?.connected ?? 0}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-3">Not Connected</p>
              <p className="tabular text-2xl font-bold text-danger">{data?.notConnected ?? 0}</p>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="h-section">Vendors</h2>
              <button onClick={() => mutate()} className="text-ink-3 hover:text-ink" aria-label="Refresh">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            {vendors.length === 0 ? (
              <EmptyState kind="empty" title="No active vendors yet" />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Vendor</th>
                    <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3 hidden sm:table-cell">Email</th>
                    <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Personal Chat</th>
                    <th className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-ink-3">Group Chat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vendors.map((v) => (
                    <tr key={v.vendorId || v.email} className="hover:bg-surface-2 transition-colors">
                      <td className="px-5 py-3 text-sm text-ink font-medium">{v.companyName} <span className="text-ink-3 font-mono text-xs">{v.vendorId}</span></td>
                      <td className="px-5 py-3 text-sm text-ink-3 hidden sm:table-cell">{v.email}</td>
                      <td className="px-5 py-3">
                        <Badge tone={v.personalConnected ? 'success' : 'danger'}>{v.personalConnected ? 'Connected' : 'Not Connected'}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={v.groupConnected ? 'success' : 'neutral'}>{v.groupConnected ? 'Connected' : 'Not Set'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
