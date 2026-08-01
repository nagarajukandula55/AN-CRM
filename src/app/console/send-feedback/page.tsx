'use client'
import { useState } from 'react'
import { MessageSquare, Send, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Field, Textarea, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

/**
 * In-app feedback submission -- any logged-in user (Brand/SC/POS) can
 * report a bug or suggestion about AN-CRM itself. Posts to /api/feedback,
 * lands in the same admin inbox as customer-facing contact-us submissions
 * (tagged source: "in-app-feedback" there).
 */
export default function SendFeedbackPage() {
  const [message, setMessage] = useState('')
  const [type, setType] = useState('OTHER')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message, type, pageUrl: typeof window !== 'undefined' ? window.location.href : undefined }),
      })
      const data = await res.json()
      if (data.success) {
        setSent(true)
        setMessage('')
      } else {
        setError(data.message || 'Failed to send feedback')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink max-w-2xl">
      <PageHeader title="Send Feedback" description="Report a bug or suggest something — goes straight to the team." />

      <Card>
        <CardBody className="space-y-4">
          {sent ? (
            <div className="flex items-center gap-2 text-success text-sm py-4">
              <CheckCircle2 className="h-5 w-5" />
              Thanks — your feedback has been sent.
              <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setSent(false)}>
                Send another
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Type">
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="BUG">Bug Report</option>
                  <option value="ENHANCEMENT">Enhancement Request</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
              <Field label="What's on your mind?">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  placeholder="A bug you ran into, something confusing, or a feature you wish existed…"
                />
              </Field>
              {error && <div className="text-sm text-danger">{error}</div>}
              <Button type="submit" disabled={sending || !message.trim()}>
                <MessageSquare className="h-4 w-4 mr-1.5" />
                {sending ? 'Sending…' : 'Send Feedback'} <Send className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
