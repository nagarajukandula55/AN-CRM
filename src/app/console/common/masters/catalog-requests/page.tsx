'use client'

/**
 * Approval queue for CatalogChangeRequest -- staff propose a new Brand/
 * Series/DeviceModel/Variant from the CRM call/jobsheet creation forms
 * ("Can't find it? Request to add"); this page is where a Super Admin
 * approves or rejects them. Bare-bones per the other masters pages in this
 * folder (table + inline actions, no polish).
 *
 * Approve/Reject buttons are hidden for non-Super-Admins (checked via
 * /api/auth/me, same pattern as admin/users/page.tsx) -- purely a UX nicety,
 * the actual enforcement is server-side (both routes hardcode
 * session.isSuperAdmin, see api/catalog/requests/[id]/approve).
 */

import { useState } from 'react'
import useSWR from 'swr'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

interface CatalogRequest {
  _id: string
  kind: 'BRAND' | 'SERIES' | 'MODEL' | 'VARIANT'
  name: string
  category?: string
  businessId?: { _id: string; name: string } | null
  brandId?: { _id: string; name: string } | null
  seriesId?: { _id: string; name: string } | null
  modelId?: { _id: string; name: string } | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  requestedBy?: { _id: string; name: string; email: string } | null
  createdAt: string
  rejectionReason?: string
}

function scopeLabel(r: CatalogRequest) {
  const parts: string[] = []
  if (r.category) parts.push(r.category)
  if (r.brandId?.name) parts.push(`Brand: ${r.brandId.name}`)
  if (r.seriesId?.name) parts.push(`Series: ${r.seriesId.name}`)
  if (r.modelId?.name) parts.push(`Model: ${r.modelId.name}`)
  return parts.join(' / ') || '—'
}

export default function CatalogChangeRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sendingReport, setSendingReport] = useState(false)
  const [reportMessage, setReportMessage] = useState<string | null>(null)

  const { data: meRes } = useSWR('/api/auth/me')
  const isSuperAdmin = !!meRes?.user?.isSuperAdmin

  // No businessId here on purpose -- this is the Super Admin's cross-business
  // approval queue, not scoped to whichever business the admin's own account
  // happens to have active (see api/catalog/requests GET's comment:
  // businessId is optional for a Super Admin, listing every business's requests).
  const { data: requestsRes, isLoading: loading, mutate: load } = useSWR(
    `/api/catalog/requests${statusFilter === 'ALL' ? '' : `?status=${statusFilter}`}`,
    { keepPreviousData: true }
  )
  const items: CatalogRequest[] = requestsRes?.success ? requestsRes.requests ?? [] : []

  async function handleApprove(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/catalog/requests/${id}/approve`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to approve')
      await load()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(id: string) {
    const reason = window.prompt('Reason for rejecting this request (optional):') || ''
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/catalog/requests/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to reject')
      await load()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSendOpsReport() {
    setSendingReport(true)
    setReportMessage(null)
    try {
      const res = await fetch('/api/cron/ops-report', { method: 'POST' })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to send ops report')
      setReportMessage(d.telegramSent ? 'Ops report sent to Telegram.' : 'Ops report generated, but Telegram delivery was skipped (not configured).')
    } catch (err: any) {
      setReportMessage(err.message || 'Something went wrong')
    } finally {
      setSendingReport(false)
    }
  }

  function statusTone(s: CatalogRequest['status']): 'warning' | 'success' | 'danger' {
    return s === 'PENDING' ? 'warning' : s === 'APPROVED' ? 'success' : 'danger'
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <PageHeader
          eyebrow="Masters"
          title="Catalog Change Requests"
          description="Brand / Series / Model / Variant additions proposed from the CRM creation forms."
          actions={
            <Button variant="secondary" size="sm" onClick={handleSendOpsReport} disabled={sendingReport} loading={sendingReport}>
              {sendingReport ? 'Sending…' : 'Send Ops Report Now'}
            </Button>
          }
        />
        {reportMessage && <div className="-mt-6 mb-4 text-xs text-ink-3">{reportMessage}</div>}

        {error && (
          <div className="mb-4 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>
        )}

        <div className="flex gap-2 mb-4">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((s) => (
            <Button key={s} variant={statusFilter === s ? 'primary' : 'secondary'} size="sm" onClick={() => setStatusFilter(s)}>
              {s}
            </Button>
          ))}
        </div>

        <div className="rounded-card border border-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-ink-3">
                <tr>
                  <th className="text-left px-4 py-3">Business</th>
                  <th className="text-left px-4 py-3">Kind</th>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Scope</th>
                  <th className="text-left px-4 py-3">Requested By</th>
                  <th className="text-left px-4 py-3">Requested At</th>
                  <th className="text-left px-4 py-3">Status</th>
                  {isSuperAdmin && <th className="text-right px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-3">Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={8}><EmptyState kind="pending" title="No requests" description="Nothing raised from the CRM creation forms yet." /></td></tr>
                ) : (
                  items.map((r) => (
                    <tr key={r._id} className="border-t border-border hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3 text-ink-3">{r.businessId?.name || '—'}</td>
                      <td className="px-4 py-3 font-medium text-ink">{r.kind}</td>
                      <td className="px-4 py-3 text-ink">{r.name}</td>
                      <td className="px-4 py-3 text-ink-3">{scopeLabel(r)}</td>
                      <td className="px-4 py-3 text-ink-3">{r.requestedBy?.name || r.requestedBy?.email || '—'}</td>
                      <td className="px-4 py-3 text-ink-3">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                        {r.status === 'REJECTED' && r.rejectionReason && (
                          <div className="text-xs text-ink-3 mt-1">{r.rejectionReason}</div>
                        )}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-4 py-3 text-right">
                          {r.status === 'PENDING' && (
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" disabled={busyId === r._id} onClick={() => handleApprove(r._id)}>Approve</Button>
                              <Button size="sm" variant="secondary" disabled={busyId === r._id} onClick={() => handleReject(r._id)}>Reject</Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
