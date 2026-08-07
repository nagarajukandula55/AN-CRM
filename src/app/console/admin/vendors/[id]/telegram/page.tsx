'use client'

/**
 * AN Group staff control panel for ONE vendor's Telegram alerts -- their
 * group chat id, personal DM chat id, and which of the two each category
 * of automated message (see core/telegram/vendorMessageTypes.ts) routes
 * to. Also a manual "Send Now" panel for one-off messages, since staff
 * regularly need to push an ad hoc note to a vendor outside any automated
 * trigger. Reads/writes via /api/businesses/[id]/telegram-routing.
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Send, Save, MessageSquare, Users, User as UserIcon } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea, Select } from '@/components/ui/Input'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'

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

export default function VendorTelegramRoutingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [businessName, setBusinessName] = useState('')
  const [messageTypes, setMessageTypes] = useState<MessageType[]>([])
  const [groupChatId, setGroupChatId] = useState('')
  const [personalChatId, setPersonalChatId] = useState('')
  const [routing, setRouting] = useState<Routing>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const [sendType, setSendType] = useState('GENERAL_ANNOUNCEMENT')
  const [sendDestination, setSendDestination] = useState<'CONFIGURED' | 'GROUP' | 'PERSONAL' | 'BOTH'>('CONFIGURED')
  const [sendText, setSendText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState('')

  useEffect(() => {
    if (!id) return
    fetch(`/api/businesses/${id}/telegram-routing`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return
        setBusinessName(d.businessName || '')
        setMessageTypes(d.messageTypes || [])
        setGroupChatId(d.telegramChatId || '')
        setPersonalChatId(d.telegramPersonalChatId || '')
        setRouting(d.telegramMessageRouting || {})
      })
      .finally(() => setLoading(false))
  }, [id])

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
      const res = await fetch(`/api/businesses/${id}/telegram-routing`, {
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

  async function handleSendNow() {
    if (!sendText.trim()) return
    setSending(true)
    setSendResult('')
    try {
      const res = await fetch(`/api/businesses/${id}/telegram-routing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: sendType,
          text: sendText,
          ...(sendDestination !== 'CONFIGURED' ? { destination: sendDestination } : {}),
        }),
      })
      const d = await res.json()
      if (d.success) {
        const parts: string[] = []
        if (d.sent?.group) parts.push('group')
        if (d.sent?.personal) parts.push('personal')
        setSendResult(parts.length ? `Sent to: ${parts.join(', ')}` : 'Not sent -- no matching chat id configured for this destination')
        setSendText('')
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
      <Button variant="secondary" size="sm" className="mb-4" onClick={() => router.push(`/console/admin/vendors/${id}`)} icon={<ArrowLeft className="w-4 h-4" />}>
        Back to Vendor
      </Button>
      <PageHeader
        eyebrow="Telegram"
        title={businessName ? `${businessName} — Telegram Alerts` : 'Vendor Telegram Alerts'}
        description="Choose which chat each type of automated alert goes to, and send one-off messages through our bot."
      />

      {msg && <p className="mb-4 text-sm text-ink-2">{msg}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardBody className="space-y-4">
            <h2 className="h-section flex items-center gap-2"><Users className="w-4 h-4" /> Group Chat</h2>
            <Field label="Group / Team Chat ID">
              <Input value={groupChatId} onChange={(e) => setGroupChatId(e.target.value)} placeholder="e.g. -1001234567890" />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-4">
            <h2 className="h-section flex items-center gap-2"><UserIcon className="w-4 h-4" /> Personal Chat</h2>
            <Field label="Owner's Personal Chat ID">
              <Input value={personalChatId} onChange={(e) => setPersonalChatId(e.target.value)} placeholder="e.g. 987654321" />
            </Field>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="h-section">Message Routing</h2>
          <p className="text-xs text-ink-3 mt-1">Which chat each category of alert is delivered to. Unconfigured types use a sensible default.</p>
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
          <h2 className="h-section flex items-center gap-2"><Send className="w-4 h-4" /> Send Now</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Message Type">
              <Select value={sendType} onChange={(e) => setSendType(e.target.value)}>
                {messageTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Destination">
              <Select value={sendDestination} onChange={(e) => setSendDestination(e.target.value as any)}>
                <option value="CONFIGURED">Use configured routing for this type</option>
                <option value="GROUP">Group only</option>
                <option value="PERSONAL">Personal only</option>
                <option value="BOTH">Both</option>
              </Select>
            </Field>
          </div>
          <Field label="Message">
            <Textarea value={sendText} onChange={(e) => setSendText(e.target.value)} rows={4} placeholder="Type the message to send…" />
          </Field>
          {sendResult && <p className="text-xs text-ink-3">{sendResult}</p>}
          <Button onClick={handleSendNow} disabled={sending || !sendText.trim()} icon={<MessageSquare className="w-4 h-4" />}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}
