'use client'

/**
 * Admin inbox for ContactMessage — messages submitted through the public
 * Contact Us page (app/contact/page.tsx -> POST /api/contact). Bare-bones
 * per the other masters/inbox pages in this app (e.g.
 * admin/masters/catalog-requests/page.tsx): list + inline status action,
 * no polish. Not businessId-scoped -- this is a single site-wide inbox.
 */

import { useState } from 'react'
import useSWR from 'swr'

interface ContactMessageRow {
  _id: string
  name: string
  email: string
  phone?: string
  subject: string
  message: string
  status: 'NEW' | 'READ' | 'RESOLVED'
  createdAt: string
}

function statusBadgeCls(status: ContactMessageRow['status']) {
  if (status === 'NEW') return 'bg-warning-soft text-warning'
  if (status === 'READ') return 'bg-info-soft text-info'
  return 'bg-success-soft text-success'
}

export default function ContactMessagesPage() {
  const [statusFilter, setStatusFilter] = useState<'NEW' | 'READ' | 'RESOLVED' | 'ALL'>('NEW')
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const qs = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`
  const {
    data: itemsRes,
    isLoading: loading,
    error: swrError,
    mutate: load,
  } = useSWR(`/api/contact${qs}`, { keepPreviousData: true })
  const items: ContactMessageRow[] = itemsRes?.success !== false ? (itemsRes?.messages || []) : []
  const error = actionError ?? (
    swrError ? (swrError instanceof Error ? swrError.message : 'Something went wrong')
      : itemsRes?.success === false ? (itemsRes.message || 'Failed to load messages') : null
  )

  async function updateStatus(id: string, status: ContactMessageRow['status']) {
    setBusyId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/contact/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to update status')
      await load()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-surface-2 text-ink">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-1">Contact Messages</h1>
        <p className="text-sm text-ink-3 mb-6">Submissions from the public Contact Us page.</p>

        {error && (
          <div className="mb-4 text-sm text-danger bg-danger-soft border border-danger rounded-card px-4 py-3">{error}</div>
        )}

        <div className="flex gap-2 mb-4">
          {(['NEW', 'READ', 'RESOLVED', 'ALL'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-control text-xs font-medium border ${statusFilter === s ? 'bg-accent text-accent-fg border-accent' : 'bg-surface text-ink-3 border-border hover:text-ink'}`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="rounded-card border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Subject</th>
                <th className="text-left px-4 py-3">Message</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-3">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-3">No messages.</td></tr>
              ) : (
                items.map((m) => (
                  <tr key={m._id} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-medium">{m.name}</td>
                    <td className="px-4 py-3 text-ink-3">
                      <div>{m.email}</div>
                      {m.phone && <div className="text-xs text-ink-3">{m.phone}</div>}
                    </td>
                    <td className="px-4 py-3">{m.subject}</td>
                    <td className="px-4 py-3 text-ink-3 max-w-xs">
                      <div className="line-clamp-2">{m.message}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-3 whitespace-nowrap">{new Date(m.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadgeCls(m.status)}`}>{m.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex gap-2 justify-end">
                        {m.status !== 'READ' && (
                          <button
                            disabled={busyId === m._id}
                            onClick={() => updateStatus(m._id, 'READ')}
                            className="px-3 py-1.5 rounded-control border border-border text-ink-3 text-xs font-medium hover:text-ink disabled:opacity-50"
                          >
                            Mark Read
                          </button>
                        )}
                        {m.status !== 'RESOLVED' && (
                          <button
                            disabled={busyId === m._id}
                            onClick={() => updateStatus(m._id, 'RESOLVED')}
                            className="px-3 py-1.5 rounded-control bg-accent text-accent-fg text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
                          >
                            Mark Resolved
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
