'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Bot, AlertTriangle } from 'lucide-react'

interface AnuIssueItem {
  _id: string
  title: string
  description: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
  source: string
  reporterEmail?: string
  resolutionNotes?: string
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-500/10 text-blue-600',
  IN_PROGRESS: 'bg-yellow-500/10 text-yellow-700',
  RESOLVED: 'bg-emerald-500/10 text-emerald-700',
}

const SEVERITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-500/10 text-gray-600',
  MEDIUM: 'bg-orange-500/10 text-orange-700',
  HIGH: 'bg-red-500/10 text-red-700',
}

const STATUSES = ['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED']

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function AdminAnuIssuesPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const qs = statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''
  const {
    data: itemsRes,
    isLoading: loading,
    error: swrError,
    mutate: fetchItems,
  } = useSWR(`/api/anu/issues${qs}`, {
    keepPreviousData: true,
  })
  const items: AnuIssueItem[] = itemsRes?.success !== false ? (itemsRes?.items || []) : []
  const error = actionError ?? (
    swrError ? (swrError instanceof Error ? swrError.message : 'Could not load ANu issues. Please try again.')
      : itemsRes?.success === false ? (itemsRes.message || 'Failed to load ANu issues') : null
  )

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/anu/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to update')
      fetchItems((prev: any) => {
        if (!prev?.items) return prev
        return { ...prev, items: prev.items.map((it: AnuIssueItem) => (it._id === id ? { ...it, status: status as AnuIssueItem['status'] } : it)) }
      }, false)
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
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Bot className="w-6 h-6" /> ANu Issues &amp; Reports
            </h1>
            <p className="text-sm text-gray-400">Problems reported through ANu, from any property (this panel, native, or elsewhere)</p>
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
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
            <Bot className="w-8 h-8 mx-auto mb-3 opacity-50" />
            No issues reported through ANu yet.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item._id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {item.severity === 'HIGH' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                      {item.title}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                      <span>{item.source}</span>
                      {item.reporterEmail && <span>{item.reporterEmail}</span>}
                      <span>{fmtDate(item.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${SEVERITY_COLORS[item.severity]}`}>
                      {item.severity}
                    </span>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_COLORS[item.status]}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mb-4 whitespace-pre-wrap">{item.description}</p>
                <div className="flex gap-2">
                  {item.status !== 'IN_PROGRESS' && item.status !== 'RESOLVED' && (
                    <button
                      disabled={updatingId === item._id}
                      onClick={() => updateStatus(item._id, 'IN_PROGRESS')}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40"
                    >
                      Mark In Progress
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
