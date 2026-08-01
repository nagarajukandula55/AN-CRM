'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Mail, Phone, MessageSquare } from 'lucide-react'

interface FeedbackItem {
  _id: string
  name: string
  email?: string
  phone?: string
  message: string
  status: 'NEW' | 'READ' | 'RESOLVED'
  source: string
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500/10 text-blue-600',
  READ: 'bg-yellow-500/10 text-yellow-700',
  RESOLVED: 'bg-emerald-500/10 text-emerald-700',
}

const STATUSES = ['ALL', 'NEW', 'READ', 'RESOLVED']

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function AdminFeedbackPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Storefront contact-us submissions only -- in-app product feedback (bug
  // reports/enhancement requests about AN-CRM itself) has its own
  // platform-wide dashboard at /console/admin/product-feedback, so it
  // doesn't also show up mixed into this per-business inbox.
  const qs = `?source=contact-form${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}`
  const { data, isLoading: loading, error: swrError, mutate: fetchItems } = useSWR(`/api/admin/feedback${qs}`, { keepPreviousData: true })
  const items: FeedbackItem[] = data?.success !== false ? (data?.items || []) : []
  const error: string | null = actionError
    ? actionError
    : swrError
      ? (swrError.message || 'Could not load feedback. Please try again.')
      : (data?.success === false ? (data.message || 'Failed to load feedback') : null)

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to update')
      fetchItems(
        (current: any) => current ? { ...current, items: (current.items || []).map((it: FeedbackItem) => (it._id === id ? { ...it, status: status as FeedbackItem['status'] } : it)) } : current,
        { revalidate: false }
      )
    } catch (err: any) {
      setActionError(err.message || 'Could not update status')
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/console')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Customer Feedback</h1>
            <p className="text-sm text-gray-400">Contact-us submissions from the storefront</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-50" />
            No feedback submissions yet.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item._id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                      {item.email && (
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {item.email}</span>
                      )}
                      {item.phone && (
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {item.phone}</span>
                      )}
                      <span>{fmtDate(item.createdAt)}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_COLORS[item.status]}`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mb-4 whitespace-pre-wrap">{item.message}</p>
                <div className="flex gap-2">
                  {item.status !== 'READ' && (
                    <button
                      disabled={updatingId === item._id}
                      onClick={() => updateStatus(item._id, 'READ')}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40"
                    >
                      Mark Read
                    </button>
                  )}
                  {item.status !== 'RESOLVED' && (
                    <button
                      disabled={updatingId === item._id}
                      onClick={() => updateStatus(item._id, 'RESOLVED')}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
