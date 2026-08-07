'use client'

/**
 * Vendor's own Telegram alert setup -- group chat / personal DM chat ids
 * and which category of alert (see core/telegram/vendorMessageTypes.ts)
 * goes to which, plus a "Send Test Message" button. Same config as AN
 * Group staff's console/admin/vendors/[id]/telegram, scoped to this
 * vendor's own business via /api/vendor/telegram-routing.
 */

import { useState, useEffect } from 'react'
import { Save, Send, Users, User as UserIcon, MessageSquare } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { LoadingPanel } from '@/components/ui/Spinner'

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

  useEffect(() => {
    fetch('/api/vendor/telegram-routing')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setMsg(d.message || 'Failed to load'); return }
        setMessageTypes(d.messageTypes || [])
        setGroupChatId(d.telegramChatId || '')
        setPersonalChatId(d.telegramPersonalChatId || '')
        setRouting(d.telegramMessageRouting || {})
      })
      .finally(() => setLoading(false))
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardBody className="space-y-4">
            <h2 className="h-section flex items-center gap-2"><Users className="w-4 h-4" /> Group Chat</h2>
            <Field label="Group / Team Chat ID" hint="Add the bot to your team group, then message it /tgid there.">
              <Input value={groupChatId} onChange={(e) => setGroupChatId(e.target.value)} placeholder="e.g. -1001234567890" />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-4">
            <h2 className="h-section flex items-center gap-2"><UserIcon className="w-4 h-4" /> Personal Chat</h2>
            <Field label="Your Personal Chat ID" hint="Message the bot directly, then send /tgid to it.">
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
