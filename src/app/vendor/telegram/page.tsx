'use client'

/**
 * Vendor's own Telegram alert setup -- group chat / personal DM chat ids
 * and which category of alert (see core/telegram/vendorMessageTypes.ts)
 * goes to which, plus a "Send Test Message" button. Same config as AN
 * Group staff's console/admin/vendors/[id]/telegram, scoped to this
 * vendor's own business via /api/vendor/telegram-routing.
 */

import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { Save, Send, Users, User as UserIcon, MessageSquare, QrCode, Copy, Check } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { LoadingPanel } from '@/components/ui/Spinner'
import { TutorialLink } from '@/components/shared/TutorialLink'
import { VendorTelegramChat } from '@/components/vendor/VendorTelegramChat'

interface MessageType {
  key: string
  label: string
  description: string
  defaultGroup: boolean
  defaultPersonal: boolean
}

interface Routing {
  [type: string]: { group: boolean; personal: boolean }
}

export default function VendorTelegramPage() {
  const [loading, setLoading] = useState(true)
  const [messageTypes, setMessageTypes] = useState<MessageType[]>([])
  const [groupChatId, setGroupChatId] = useState('')
  const [personalChatId, setPersonalChatId] = useState('')
  const [routing, setRouting] = useState<Routing>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const [testText, setTestText] = useState('This is a test message from your Telegram bot setup.')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState('')

  // One-tap linking -- QR/deep-link code, replacing "message the bot
  // /tgid and paste the raw chat id here" as the primary flow. See
  // api/vendor/telegram-link-code and api/telegram/webhook's own comments
  // for why a random code (not the vendor's own real Vendor ID) is used.
  const [linkCode, setLinkCode] = useState('')
  const [linkQr, setLinkQr] = useState('')
  const [linkDeepLink, setLinkDeepLink] = useState('')
  const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [copied, setCopied] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (!linkExpiresAt) return
    const tick = () => setSecondsLeft(Math.max(0, Math.round((linkExpiresAt - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [linkExpiresAt])

  async function generateLinkCode() {
    setGeneratingCode(true)
    setLinkError('')
    try {
      const res = await fetch('/api/vendor/telegram-link-code', { method: 'POST' })
      const d = await res.json()
      if (!d.success) { setLinkError(d.message || 'Failed to generate code'); return }
      setLinkCode(d.code)
      setLinkExpiresAt(new Date(d.expiresAt).getTime())
      setLinkDeepLink(d.deepLink || '')
      if (d.deepLink) {
        const dataUrl = await QRCode.toDataURL(d.deepLink, { width: 220, margin: 1 })
        setLinkQr(dataUrl)
      } else {
        setLinkQr('')
      }
    } catch {
      setLinkError('Failed to generate code')
    } finally {
      setGeneratingCode(false)
    }
  }

  function copyCode() {
    if (!linkCode) return
    navigator.clipboard?.writeText(linkCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function loadRouting(showLoading: boolean) {
    if (showLoading) setLoading(true)
    return fetch('/api/vendor/telegram-routing')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setMsg(d.message || 'Failed to load'); return }
        setMessageTypes(d.messageTypes || [])
        setGroupChatId(d.telegramChatId || '')
        setPersonalChatId(d.telegramPersonalChatId || '')
        setRouting(d.telegramMessageRouting || {})
      })
      .finally(() => { if (showLoading) setLoading(false) })
  }

  useEffect(() => {
    loadRouting(true)

    // Linking happens in the Telegram app (a separate tab/window), so
    // there's no in-page event to react to -- refetching when the tab
    // regains focus is what actually shows the newly-linked chat id
    // without the vendor needing to manually reload.
    function onVisible() {
      if (document.visibilityState === 'visible') loadRouting(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  function toggle(type: string, field: 'group' | 'personal', def: MessageType) {
    setRouting((prev) => {
      const current = prev[type] || { group: def.defaultGroup, personal: def.defaultPersonal }
      return { ...prev, [type]: { ...current, [field]: !current[field] } }
    })
  }

  async function handleSave() {
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/vendor/telegram-routing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramChatId: groupChatId,
          telegramPersonalChatId: personalChatId,
          telegramMessageRouting: routing,
        }),
      })
      const d = await res.json()
      setMsg(d.success ? 'Saved.' : (d.message || 'Failed to save'))
    } catch {
      setMsg('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestSend() {
    if (!testText.trim()) return
    setSending(true)
    setSendResult('')
    try {
      const res = await fetch('/api/vendor/telegram-routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText }),
      })
      const d = await res.json()
      if (d.success) {
        const parts: string[] = []
        if (d.sent?.group) parts.push('group')
        if (d.sent?.personal) parts.push('personal')
        setSendResult(parts.length ? `Sent to: ${parts.join(', ')}` : 'Not sent -- add a chat id above first, and link it to the bot.')
      } else {
        setSendResult(d.message || 'Failed to send')
      }
    } catch {
      setSendResult('Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-bg"><LoadingPanel label="Loading…" /></div>

  return (
    <div className="min-h-screen bg-bg p-6">
      <PageHeader
        eyebrow="Notifications"
        title="Telegram Alerts"
        description="Set up your Telegram bot so alerts land where you want -- your team group, your personal chat, or both."
      />

      {msg && <p className="mb-4 text-sm text-ink-2">{msg}</p>}

      <Card className="mb-6">
        <CardBody className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="h-section flex items-center gap-2"><QrCode className="w-4 h-4" /> Connect Telegram</h2>
              <p className="text-xs text-ink-3 mt-1">
                Generate a code, then either scan the QR with your phone (opens the bot and links your <b>personal chat</b> instantly),
                or add the bot to your team group and send it the code there to link the <b>group chat</b>. Each code works once and expires in 15 minutes.
              </p>
            </div>
            <TutorialLink videoKey="telegram-setup" />
          </div>

          {linkError && <p className="text-sm text-danger">{linkError}</p>}

          {!linkCode || secondsLeft <= 0 ? (
            <Button onClick={generateLinkCode} disabled={generatingCode} icon={<QrCode className="w-4 h-4" />}>
              {generatingCode ? 'Generating…' : linkCode ? 'Generate a new code' : 'Generate code'}
            </Button>
          ) : (
            <div className="flex flex-col sm:flex-row items-start gap-5">
              {linkQr && (
                <div className="flex-shrink-0 p-2 bg-surface rounded-control border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={linkQr} alt="Scan to connect Telegram" width={160} height={160} />
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-mono font-bold tracking-[0.2em] text-ink">{linkCode}</span>
                  <button type="button" onClick={copyCode} className="text-ink-3 hover:text-ink" aria-label="Copy code">
                    {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-ink-3">Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</p>
                {linkDeepLink && (
                  <a href={linkDeepLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
                    <Send className="w-3.5 h-3.5" /> Open in Telegram (personal chat)
                  </a>
                )}
                <p className="text-xs text-ink-3">For your team group: add the bot, then send <span className="font-mono font-semibold">{linkCode}</span> as a message there.</p>
                <Button variant="ghost" size="sm" onClick={generateLinkCode} disabled={generatingCode}>Generate a new code</Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mb-6">
        <VendorTelegramChat />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardBody className="space-y-4">
            <h2 className="h-section flex items-center gap-2"><Users className="w-4 h-4" /> Group Chat</h2>
            <Field label="Group / Team Chat ID" hint="Set automatically once you link above. Advanced: paste one manually if you already have it.">
              <Input value={groupChatId} onChange={(e) => setGroupChatId(e.target.value)} placeholder="e.g. -1001234567890" />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-4">
            <h2 className="h-section flex items-center gap-2"><UserIcon className="w-4 h-4" /> Personal Chat</h2>
            <Field label="Your Personal Chat ID" hint="Set automatically once you link above. Advanced: paste one manually if you already have it.">
              <Input value={personalChatId} onChange={(e) => setPersonalChatId(e.target.value)} placeholder="e.g. 987654321" />
            </Field>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="h-section">Alert Routing</h2>
          <p className="text-xs text-ink-3 mt-1">Choose which chat each type of alert goes to.</p>
        </div>
        <div className="divide-y divide-border">
          {messageTypes.map((t) => {
            const cur = routing[t.key] || { group: t.defaultGroup, personal: t.defaultPersonal }
            return (
              <div key={t.key} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">{t.label}</p>
                  <p className="text-xs text-ink-3">{t.description}</p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <label className="flex items-center gap-1.5 text-xs text-ink-2">
                    <input type="checkbox" checked={!!cur.group} onChange={() => toggle(t.key, 'group', t)} /> Group
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-ink-2">
                    <input type="checkbox" checked={!!cur.personal} onChange={() => toggle(t.key, 'personal', t)} /> Personal
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Button onClick={handleSave} disabled={saving} icon={<Save className="w-4 h-4" />} className="mb-8">
        {saving ? 'Saving…' : 'Save Routing'}
      </Button>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="h-section flex items-center gap-2"><Send className="w-4 h-4" /> Send Test Message</h2>
          <Field label="Message">
            <Textarea value={testText} onChange={(e) => setTestText(e.target.value)} rows={3} />
          </Field>
          {sendResult && <p className="text-xs text-ink-3">{sendResult}</p>}
          <Button onClick={handleTestSend} disabled={sending || !testText.trim()} icon={<MessageSquare className="w-4 h-4" />}>
            {sending ? 'Sending…' : 'Send Test'}
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}
