'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Save, Loader2, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { LoadingPanel } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'

/**
 * Super-Admin-only bulk view/edit of every business's Telegram Group/
 * Personal chat ID in one screen -- the fast alternative to opening each
 * vendor's own console/admin/vendors/[id]/telegram page individually.
 * Same fields, same bot linking logic they feed (api/telegram/webhook's
 * /link flow) -- editing here is exactly as if the vendor had sent
 * /link themselves, for when the bot linking flow needs a manual
 * workaround (e.g. group privacy mode blocking the bot from seeing a
 * bare Vendor ID message -- see this page's own note below).
 */

interface Row {
  _id: string
  name: string
  vendorId: string | null
  telegramChatId: string
  telegramPersonalChatId: string
  telegramReportFrequency: string
}

export default function TelegramIdsAdminPage() {
  const { data, mutate, isLoading } = useSWR('/api/admin/telegram-ids', (url: string) =>
    fetch(url, { credentials: 'include' }).then((r) => r.json())
  )
  const businesses: Row[] = data?.success ? data.businesses : []
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, { telegramChatId: string; telegramPersonalChatId: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const filtered = businesses.filter((b) => {
    const q = search.toLowerCase()
    return !q || b.name.toLowerCase().includes(q) || (b.vendorId || '').toLowerCase().includes(q)
  })

  function draftFor(b: Row) {
    return drafts[b._id] ?? { telegramChatId: b.telegramChatId, telegramPersonalChatId: b.telegramPersonalChatId }
  }

  async function save(b: Row) {
    setSavingId(b._id)
    setSavedId(null)
    try {
      const d = draftFor(b)
      await fetch('/api/admin/telegram-ids', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: b._id, ...d }),
      })
      setDrafts((p) => { const n = { ...p }; delete n[b._id]; return n })
      setSavedId(b._id)
      mutate()
      setTimeout(() => setSavedId(null), 2000)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Telegram Chat IDs"
        description="Every vendor's Group/Personal Telegram chat ID in one place -- edit directly here, same effect as that vendor sending /link themselves."
      />

      <div className="rounded-card border border-warning/20 bg-warning-soft px-4 py-3 text-xs text-warning mb-4">
        If a vendor's group isn't confirming a linked Vendor ID: Telegram groups only deliver plain (non-command)
        messages to a bot when that bot's <b>Privacy Mode is disabled</b> -- otherwise the bot never even sees a
        bare <code>VND0001</code> message, only real <code>/commands</code>. Turn it off once via
        @BotFather &gt; /setprivacy &gt; Disable for this bot, or have the vendor use{' '}
        <code>/link VND0001</code> instead (commands always get through regardless of privacy mode). Use the
        fields below as a manual fallback either way.
      </div>

      <div className="relative max-w-sm mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by business or Vendor ID…" className="pl-9" />
      </div>

      {isLoading ? (
        <LoadingPanel label="Loading…" />
      ) : filtered.length === 0 ? (
        <EmptyState kind="search" title="No businesses found" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-3 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5">Business</th>
                  <th className="text-left px-4 py-2.5">Group Chat ID</th>
                  <th className="text-left px-4 py-2.5">Personal Chat ID</th>
                  <th className="text-left px-4 py-2.5">Reports</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((b) => {
                  const d = draftFor(b)
                  const dirty = !!drafts[b._id]
                  return (
                    <tr key={b._id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-ink">{b.name}</p>
                        {b.vendorId && <p className="text-xs text-ink-3 tabular">{b.vendorId}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          value={d.telegramChatId}
                          onChange={(e) => setDrafts((p) => ({ ...p, [b._id]: { ...d, telegramChatId: e.target.value } }))}
                          placeholder="e.g. -1001234567890"
                          className="w-44 rounded-control border border-border bg-surface px-2 py-1.5 text-xs tabular"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          value={d.telegramPersonalChatId}
                          onChange={(e) => setDrafts((p) => ({ ...p, [b._id]: { ...d, telegramPersonalChatId: e.target.value } }))}
                          placeholder="e.g. 987654321"
                          className="w-40 rounded-control border border-border bg-surface px-2 py-1.5 text-xs tabular"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={b.telegramReportFrequency === 'NONE' ? 'neutral' : 'success'}>{b.telegramReportFrequency}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {savedId === b._id ? (
                          <span className="text-xs text-success">Saved</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => save(b)}
                            disabled={!dirty || savingId === b._id}
                            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline disabled:opacity-40 disabled:no-underline"
                          >
                            {savingId === b._id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            Save
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
