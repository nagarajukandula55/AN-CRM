'use client'

/**
 * Super-admin/platform-staff inbox for every vendor's inbuilt Telegram
 * support chat (VendorChatMessage) -- previously readable/writable only
 * from the vendor's own side (/vendor/telegram), so an inbound message
 * from a vendor had nowhere for anyone at AN Group to see or answer it.
 * Replying here delivers straight to that vendor's linked personal
 * Telegram chat (api/admin/vendor-chats/[vendorId] POST), same as if a
 * human replied from inside Telegram itself.
 */

import { useState } from 'react'
import useSWR from 'swr'
import { Send, MessageSquare, Store } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel, Spinner } from '@/components/ui/Spinner'

interface ThreadSummary {
  vendorId: string
  vendorCode?: string
  companyName: string
  contactPerson?: string
  hasTelegramLinked: boolean
  lastMessage: string
  lastDirection: 'inbound' | 'outbound'
  lastAt: string
  unreadCount: number
}

interface ChatMessage {
  _id: string
  direction: 'inbound' | 'outbound'
  text: string
  createdAt: string
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function VendorChatsAdminPage() {
  const { data: threadsRes, isLoading: loadingThreads, mutate: refetchThreads } = useSWR('/api/admin/vendor-chats', {
    refreshInterval: 20000,
  })
  const threads: ThreadSummary[] = threadsRes?.success ? threadsRes.threads : []

  const [activeVendorId, setActiveVendorId] = useState<string | null>(null)
  const { data: threadRes, isLoading: loadingThread, mutate: refetchThread } = useSWR(
    activeVendorId ? `/api/admin/vendor-chats/${activeVendorId}` : null,
    { refreshInterval: 15000 }
  )
  const messages: ChatMessage[] = threadRes?.success ? threadRes.messages : []
  const activeVendor = threadRes?.success ? threadRes.vendor : null

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  function openThread(vendorId: string) {
    setActiveVendorId(vendorId)
    setDraft('')
    setError('')
    // Optimistically clear the unread badge in the list -- the GET this
    // triggers also marks the messages read server-side.
    setTimeout(() => { refetchThreads() }, 500)
  }

  async function send() {
    if (!activeVendorId || !draft.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/vendor-chats/${activeVendorId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft.trim() }),
      })
      const d = await res.json()
      if (!d.success) { setError(d.message || 'Failed to send'); return }
      setDraft('')
      refetchThread()
      refetchThreads()
    } catch {
      setError('Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg p-6">
      <PageHeader
        eyebrow="Support"
        title="Vendor Chats"
        description="Every vendor's inbuilt Telegram support chat -- reply here and it delivers straight to their linked personal Telegram chat."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 mt-4">
        <Card className="overflow-hidden flex flex-col h-[32rem]">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="h-section flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Threads</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <LoadingPanel label="Loading…" />
            ) : threads.length === 0 ? (
              <EmptyState kind="empty" title="No vendor chats yet" description="A thread appears here once a vendor sends a message." />
            ) : (
              <div className="divide-y divide-border">
                {threads.map((t) => (
                  <button
                    key={t.vendorId}
                    onClick={() => openThread(t.vendorId)}
                    className={`w-full text-left px-4 py-3 hover:bg-surface-2 transition ${activeVendorId === t.vendorId ? 'bg-surface-2' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink truncate">{t.companyName}</p>
                      {t.unreadCount > 0 && <Badge tone="danger">{t.unreadCount}</Badge>}
                    </div>
                    <p className="text-xs text-ink-3 truncate mt-0.5">
                      {t.lastDirection === 'outbound' ? 'You: ' : ''}{t.lastMessage}
                    </p>
                    <p className="text-[10px] text-ink-3 mt-1">{t.vendorCode} · {timeAgo(t.lastAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col h-[32rem]">
          {!activeVendorId ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <p className="text-sm text-ink-3">Select a vendor thread to view and reply.</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Store className="w-4 h-4 text-ink-3" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{activeVendor?.companyName || '...'}</p>
                  <p className="text-[11px] text-ink-3">{activeVendor?.vendorCode} · {activeVendor?.contactPerson}</p>
                </div>
                {activeVendor && !activeVendor.telegramLinked && (
                  <Badge tone="warning">No Telegram linked</Badge>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {loadingThread ? (
                  <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>
                ) : messages.length === 0 ? (
                  <p className="text-xs text-ink-3 text-center py-8">No messages yet.</p>
                ) : (
                  messages.map((m) => (
                    <div key={m._id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-card px-3 py-2 text-sm ${
                          m.direction === 'outbound' ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-ink'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <p className={`text-[10px] mt-1 ${m.direction === 'outbound' ? 'text-accent-fg/70' : 'text-ink-3'}`}>
                          {new Date(m.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {error && <p className="px-4 text-xs text-danger">{error}</p>}

              <div className="p-3 border-t border-border flex items-center gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder={activeVendor?.telegramLinked ? 'Type a reply…' : 'Vendor has no linked Telegram chat'}
                  disabled={!activeVendor?.telegramLinked}
                  className="flex-1 rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong disabled:opacity-50"
                />
                <Button size="sm" onClick={send} disabled={sending || !draft.trim() || !activeVendor?.telegramLinked} icon={<Send className="w-3.5 h-3.5" />}>
                  Send
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
