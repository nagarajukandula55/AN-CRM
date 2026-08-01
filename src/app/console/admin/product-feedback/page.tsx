'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { AlertCircle, Bug, Lightbulb, MessageSquare, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * Super Admin / AN Group-only dashboard for in-app product feedback (bug
 * reports, enhancement requests, anything else submitted from Send
 * Feedback across every business), platform-wide -- not scoped to
 * whichever business the viewer happens to be currently active in. See
 * api/admin/feedback/route.ts's fix for why this used to look empty
 * ("said saved but not seen"): the same GET route was defaulting platform
 * staff to their currently-active-business scope instead of showing
 * everything.
 *
 * Deliberately separate from /console/feedback (per-business storefront
 * "Customer Feedback" / contact-us inbox) -- these are a different
 * audience (AN-CRM's own product team) and a different shape of data
 * (bug/enhancement type, page URL, no phone number).
 */

interface FeedbackItem {
  _id: string
  name: string
  email?: string
  businessName?: string
  message: string
  type?: 'BUG' | 'ENHANCEMENT' | 'OTHER'
  pageUrl?: string
  status: 'NEW' | 'READ' | 'RESOLVED'
  createdAt: string
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  BUG: Bug,
  ENHANCEMENT: Lightbulb,
  OTHER: MessageSquare,
}
const TYPE_TONE: Record<string, 'danger' | 'info' | 'neutral'> = {
  BUG: 'danger',
  ENHANCEMENT: 'info',
  OTHER: 'neutral',
}
const STATUS_TONE: Record<string, 'info' | 'warning' | 'success'> = {
  NEW: 'info',
  READ: 'warning',
  RESOLVED: 'success',
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function ProductFeedbackPage() {
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const { data: meData } = useSWR('/api/auth/me')
  const isSuperAdmin = !!meData?.user?.isSuperAdmin || !!meData?.user?.isPlatformStaff

  const qs = new URLSearchParams({ source: 'in-app-feedback', ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}) })
  const { data, isLoading, mutate } = useSWR(isSuperAdmin ? `/api/admin/feedback?${qs.toString()}` : null, { keepPreviousData: true })
  const allItems: FeedbackItem[] = data?.success !== false ? (data?.items || []) : []
  const items = typeFilter === 'ALL' ? allItems : allItems.filter((i) => (i.type || 'OTHER') === typeFilter)

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to update')
      mutate()
    } finally {
      setUpdatingId(null)
    }
  }

  if (!meData) return <LoadingPanel label="Loading…" />

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-3 text-center px-6">
        <AlertCircle className="w-10 h-10 text-ink-3" />
        <h2 className="h-section">Super Admin only</h2>
        <p className="text-sm text-ink-2 max-w-sm">This platform-wide product feedback dashboard is only visible to AN Group / Super Admin accounts.</p>
      </div>
    )
  }

  const counts = {
    NEW: allItems.filter((i) => i.status === 'NEW').length,
    BUG: allItems.filter((i) => (i.type || 'OTHER') === 'BUG').length,
    ENHANCEMENT: allItems.filter((i) => (i.type || 'OTHER') === 'ENHANCEMENT').length,
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Product Feedback"
        description="Bug reports, enhancement requests, and anything else submitted via Send Feedback — every business, one queue."
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><CardBody><div className="eyebrow">New</div><div className="text-xl font-semibold tabular mt-1">{counts.NEW}</div></CardBody></Card>
        <Card><CardBody><div className="eyebrow">Bugs</div><div className="text-xl font-semibold tabular mt-1 text-danger">{counts.BUG}</div></CardBody></Card>
        <Card><CardBody><div className="eyebrow">Enhancements</div><div className="text-xl font-semibold tabular mt-1 text-info">{counts.ENHANCEMENT}</div></CardBody></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
          <option value="ALL">All statuses</option>
          <option value="NEW">New</option>
          <option value="READ">Read</option>
          <option value="RESOLVED">Resolved</option>
        </Select>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40">
          <option value="ALL">All types</option>
          <option value="BUG">Bug</option>
          <option value="ENHANCEMENT">Enhancement</option>
          <option value="OTHER">Other</option>
        </Select>
      </div>

      {isLoading ? (
        <LoadingPanel label="Loading feedback…" />
      ) : items.length === 0 ? (
        <EmptyState kind="empty" title="No feedback yet" description="Bug reports and enhancement requests submitted from any business will show up here." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = TYPE_ICON[item.type || 'OTHER']
            return (
              <Card key={item._id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge tone={TYPE_TONE[item.type || 'OTHER']}>
                        <Icon className="w-3 h-3 mr-1 inline" />{item.type || 'OTHER'}
                      </Badge>
                      <span className="font-medium text-ink">{item.name}</span>
                      {item.businessName && <span className="text-xs text-ink-3">— {item.businessName}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
                      <span className="text-xs text-ink-3">{fmtDate(item.createdAt)}</span>
                    </div>
                  </div>
                  <p className="text-sm text-ink-2 mb-3 whitespace-pre-wrap">{item.message}</p>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs text-ink-3 flex items-center gap-3">
                      {item.email && <span>{item.email}</span>}
                      {item.pageUrl && (
                        <a href={item.pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:opacity-70">
                          <ExternalLink className="w-3 h-3" /> Page
                        </a>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {item.status !== 'READ' && (
                        <Button variant="secondary" size="sm" disabled={updatingId === item._id} onClick={() => updateStatus(item._id, 'READ')}>Mark Read</Button>
                      )}
                      {item.status !== 'RESOLVED' && (
                        <Button size="sm" disabled={updatingId === item._id} onClick={() => updateStatus(item._id, 'RESOLVED')}>Mark Resolved</Button>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
