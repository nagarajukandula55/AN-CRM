'use client'
import { useRef, useState } from 'react'
import useSWR from 'swr'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'
import TextFormatToolbar, { EMAIL_FORMAT_BUTTONS } from '@/components/shared/TextFormatToolbar'

/**
 * Super-Admin-only: every transactional email occasion the app can send
 * (core/email/emailOccasions.ts), with a subject/body editor and an
 * enable/disable kill switch per occasion -- mirrors the Telegram
 * Notification Templates section in Settings > Platform (AN Group).
 * A blank subject+body (still enabled) reverts to that occasion's
 * hardcoded fallback wording (services/email/resend.service.ts); marking
 * it disabled skips sending that occasion's email entirely.
 */

interface Occasion {
  key: string
  label: string
  description: string
  tokens: string[]
  subject: string
  html: string
  enabled: boolean
  isCustom: boolean
}

export default function EmailTemplatesPage() {
  const { data, mutate, isLoading } = useSWR('/api/admin/email-templates', (url: string) =>
    fetch(url, { credentials: 'include' }).then((r) => r.json())
  )
  const occasions: Occasion[] = data?.success ? data.occasions : []

  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [subjectDrafts, setSubjectDrafts] = useState<Record<string, string>>({})
  const [htmlDrafts, setHtmlDrafts] = useState<Record<string, string>>({})
  const [enabledDrafts, setEnabledDrafts] = useState<Record<string, boolean>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  async function save(o: Occasion, enabledOverride?: boolean) {
    setSavingKey(o.key)
    try {
      const enabled = enabledOverride ?? enabledDrafts[o.key] ?? o.enabled
      await fetch('/api/admin/email-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: o.key,
          subject: subjectDrafts[o.key] ?? o.subject,
          html: htmlDrafts[o.key] ?? o.html,
          enabled,
        }),
      })
      mutate()
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Email Templates"
        description="Subject/body for every transactional email the system sends -- forgot password, vendor sign-up, account credentials, agreements, and more. Blank reverts to the built-in wording; disabling skips that email entirely."
      />

      {isLoading ? (
        <LoadingPanel label="Loading…" />
      ) : (
        <div className="space-y-3">
          {occasions.map((o) => {
            const expanded = expandedKey === o.key
            const isEnabled = enabledDrafts[o.key] ?? o.enabled
            return (
              <Card key={o.key} className="overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink">{o.label}</p>
                      {o.isCustom && <Badge tone="info">Custom</Badge>}
                    </div>
                    <p className="text-xs text-ink-3 mt-0.5">{o.description}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <label className="flex items-center gap-1.5 text-xs text-ink-2">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={(e) => {
                          const next = e.target.checked
                          setEnabledDrafts((d) => ({ ...d, [o.key]: next }))
                          save(o, next)
                        }}
                      /> Enabled
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!expanded) {
                          setSubjectDrafts((d) => ({ ...d, [o.key]: d[o.key] ?? o.subject }))
                          setHtmlDrafts((d) => ({ ...d, [o.key]: d[o.key] ?? o.html }))
                        }
                        setExpandedKey(expanded ? null : o.key)
                      }}
                      className="text-xs font-medium text-accent hover:underline whitespace-nowrap"
                    >
                      {expanded ? 'Close' : 'Edit Template'}
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="px-5 pb-5 bg-surface-2 border-t border-border space-y-3 pt-4">
                    <div>
                      <label className="text-xs text-ink-3 mb-1 block">Subject</label>
                      <input
                        value={subjectDrafts[o.key] ?? o.subject}
                        onChange={(e) => setSubjectDrafts((d) => ({ ...d, [o.key]: e.target.value }))}
                        placeholder="Leave blank to use the built-in default subject"
                        className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-ink-3 mb-1 block">Body (HTML)</label>
                      <TextFormatToolbar
                        buttons={EMAIL_FORMAT_BUTTONS}
                        textareaRef={htmlTextareaRef}
                        onChange={(next) => setHtmlDrafts((d) => ({ ...d, [o.key]: next }))}
                      />
                      <textarea
                        ref={htmlTextareaRef}
                        rows={8}
                        value={htmlDrafts[o.key] ?? o.html}
                        onChange={(e) => setHtmlDrafts((d) => ({ ...d, [o.key]: e.target.value }))}
                        placeholder="Leave blank to use the built-in default wording. Plain HTML -- <p>, <b>, <a href> all work."
                        className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong font-mono"
                      />
                    </div>
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="text-xs text-ink-3">Tokens:</span>
                      {o.tokens.length === 0 && <span className="text-xs text-ink-3">none</span>}
                      {o.tokens.map((tok) => (
                        <code
                          key={tok}
                          className="text-xs bg-surface border border-border rounded px-1.5 py-0.5 text-ink-2 cursor-pointer"
                          onClick={() => setHtmlDrafts((d) => ({ ...d, [o.key]: (d[o.key] ?? o.html) + `{{${tok}}}` }))}
                          title="Click to insert into body"
                        >
                          {`{{${tok}}}`}
                        </code>
                      ))}
                    </div>
                    <div>
                      <span className="text-xs text-ink-3 block mb-1">Preview</span>
                      <div
                        className="rounded-control border border-dashed border-border bg-surface px-4 py-3 text-sm text-ink"
                        dangerouslySetInnerHTML={{ __html: (htmlDrafts[o.key] ?? o.html) || '<span class="text-ink-3">(built-in default wording)</span>' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => save(o)}
                      disabled={savingKey === o.key}
                      className="text-xs font-medium bg-accent text-accent-fg rounded-control px-3 py-1.5 hover:bg-accent-hover disabled:opacity-50"
                    >
                      {savingKey === o.key ? 'Saving…' : 'Save Template'}
                    </button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
