'use client'

/**
 * Inbuilt support chat -- rides on the vendor's own linked personal
 * Telegram chat (see api/vendor/chat, api/telegram/webhook's inbound-
 * message handler). The vendor types here; it sends via the Telegram Bot
 * API to their linked personal chat. A human reply from Telegram shows up
 * here on the next poll/refresh. Isolation: strictly scoped to THIS
 * vendor's own telegramPersonalChatId, which only ever gets set from a
 * message the vendor sent from their own Telegram account -- see
 * VendorChatMessage's own comment for why that's a safe boundary (unlike
 * a group chat, which can legitimately be shared across vendors).
 */

import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface ChatMessage {
  _id: string
  direction: 'outbound' | 'inbound'
  text: string
  createdAt: string
}

export function VendorTelegramChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  function load(silent = false) {
    if (!silent) setLoading(true)
    return fetch('/api/vendor/chat')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return
        setMessages(d.messages || [])
        setLinked(!!d.telegramLinked)
      })
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false) })
  }

  useEffect(() => {
    load(false)
    const interval = setInterval(() => load(true), 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/vendor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const d = await res.json()
      if (!d.success) { setError(d.message || 'Failed to send'); return }
      setDraft('')
      setMessages((prev) => [...prev, d.message])
    } catch {
      setError('Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="flex flex-col h-[28rem]">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="h-section">Support Chat</h2>
        <p className="text-xs text-ink-3 mt-0.5">Messages here go to your linked personal Telegram chat, and replies show up here.</p>
      </div>

      {!linked && !loading ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <p className="text-sm text-ink-3">Link your personal Telegram chat above first to start a support chat.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>
            ) : messages.length === 0 ? (
              <p className="text-xs text-ink-3 text-center py-8">No messages yet -- say hello.</p>
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
                      {new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {error && <p className="px-4 text-xs text-danger">{error}</p>}

          <div className="p-3 border-t border-border flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Type a message…"
              className="flex-1 rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong"
            />
            <Button size="sm" onClick={send} disabled={sending || !draft.trim()} icon={<Send className="w-3.5 h-3.5" />}>
              Send
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
