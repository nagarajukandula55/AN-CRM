'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, X, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { Field, Select } from '@/components/ui/Input'

interface Call {
  _id: string
  callNumber: string
  customerName: string
  phone: string
  subject: string
  status: string
  priority: string
  createdAt: string
  assignedTo?: { name?: string; email?: string }
  jobSheetId?: string
}

interface StaffMember {
  _id: string
  userId: { _id: string; name: string; email: string } | string
}

interface Brand {
  _id: string
  name: string
}

interface FaultCode {
  _id: string
  code: string
  description: string
}

interface DeviceModelOption {
  _id: string
  name: string
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  NEW: 'info',
  CONTACTED: 'warning',
  QUALIFIED: 'info',
  JOB_CREATED: 'info',
  IN_PROGRESS: 'warning',
  CLOSED_WON: 'success',
  CLOSED_LOST: 'danger',
  NOT_INTERESTED: 'neutral',
  NO_RESPONSE: 'neutral',
}

const STATUSES = ['ALL', 'NEW', 'CONTACTED', 'QUALIFIED', 'JOB_CREATED', 'IN_PROGRESS', 'CLOSED_WON', 'CLOSED_LOST', 'NOT_INTERESTED', 'NO_RESPONSE']

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Vendor's own view of the same CRM Calls feature (see /console/crm/calls) --
// reuses the exact same /api/crm/calls endpoint (already permission-gated
// on crm_calls.view/create, which a vendor's CCO/Engineer/Centre Manager
// already holds via MEMBER_TYPE_IMPLIED_MODULES) rather than duplicating
// the business logic into a second API, per this model's own top comment
// warning against exactly that class of duplication bug. The only real
// difference from the admin page: defaults to "assigned to my vendor
// team" (assignedToIn) instead of showing the whole business's calls.
export default function VendorCrmCallsPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [convertingCall, setConvertingCall] = useState<Call | null>(null)
  const [convertForm, setConvertForm] = useState({
    warrantyStatus: '', deviceAppearance: '', fileBackupDescription: '', brandId: '', deviceModelId: '', deviceModel: '', faultCodeId: '',
  })
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)

  const { data: meData } = useSWR('/api/auth/me')
  const businessId: string | null = meData?.user?.activeBusinessId ?? meData?.businesses?.[0]?._id ?? null

  const { data: brandsRes } = useSWR(businessId ? `/api/brands?businessId=${businessId}` : null)
  const brands: Brand[] = brandsRes ? (brandsRes.brands || brandsRes.data || []) : []

  const { data: faultCodesRes } = useSWR(businessId ? `/api/fault-codes?businessId=${businessId}` : null)
  const faultCodes: FaultCode[] = faultCodesRes?.faultCodes || []

  const { data: staffRes } = useSWR('/api/vendor/staff')
  const teamIds: string[] = staffRes?.success
    ? (staffRes.staff || [])
        .map((s: StaffMember) => (typeof s.userId === 'string' ? s.userId : s.userId?._id))
        .filter(Boolean)
    : []

  const callsParams = new URLSearchParams()
  if (statusFilter !== 'ALL') callsParams.set('status', statusFilter)
  if (teamIds.length > 0) callsParams.set('assignedToIn', teamIds.join(','))
  const callsKey = teamIds.length > 0 ? `/api/crm/calls?${callsParams.toString()}` : null
  const { data: callsRes, error: callsFetchError, isLoading: loading, mutate: fetchCalls } = useSWR(callsKey, { keepPreviousData: true })
  const calls: Call[] = callsRes?.success === false ? [] : (callsRes?.calls || [])
  const error: string | null = callsFetchError
    ? (callsFetchError instanceof Error ? callsFetchError.message : 'Could not load appointments')
    : (callsRes?.success === false ? (callsRes.message || 'Failed to load appointments') : null)

  const { data: convertModelsRes, isLoading: loadingConvertModels } = useSWR(
    convertForm.brandId && businessId ? `/api/device-models?businessId=${businessId}&brandId=${convertForm.brandId}` : null
  )
  const convertModels: DeviceModelOption[] = convertModelsRes?.models || []

  function openConvert(call: Call) {
    setConvertingCall(call)
    setConvertForm({ warrantyStatus: '', deviceAppearance: '', fileBackupDescription: '', brandId: '', deviceModelId: '', deviceModel: '', faultCodeId: '' })
    setConvertError(null)
  }

  async function submitConvert(e: React.FormEvent) {
    e.preventDefault()
    if (!convertingCall) return
    setConverting(true)
    setConvertError(null)
    try {
      const res = await fetch(`/api/crm/calls/${convertingCall._id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: convertingCall.subject,
          warrantyStatus: convertForm.warrantyStatus || undefined,
          deviceAppearance: convertForm.deviceAppearance || undefined,
          fileBackupDescription: convertForm.fileBackupDescription || undefined,
          // Left blank = keep the appointment's own brand/model (the
          // convert route falls back to call.brandId/call.deviceModel);
          // only override when the CCO actually picked one here.
          brandId: convertForm.brandId || undefined,
          deviceModel: convertForm.deviceModel || undefined,
          deviceModelId: convertForm.deviceModelId || undefined,
          faultCodeId: convertForm.faultCodeId || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to convert to workorder')
      setConvertingCall(null)
      fetchCalls()
      router.push('/vendor/crm/jobsheets')
    } catch (err: any) {
      setConvertError(err.message || 'Something went wrong')
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          title="Appointments"
          description="Your team's calls & appointments"
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => router.push('/vendor')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
              <Button onClick={() => router.push('/vendor/crm/calls/new')} icon={<Plus className="w-4 h-4" />}>New Appointment</Button>
            </>
          }
        />

        {error && (
          <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>
        )}

        <div className="flex gap-1 flex-wrap mb-6">
          {STATUSES.map((s) => (
            <Button key={s} variant={statusFilter === s ? 'primary' : 'secondary'} size="sm" onClick={() => setStatusFilter(s)}>
              {s.replace(/_/g, ' ')}
            </Button>
          ))}
        </div>

        <div className="rounded-card border border-border bg-surface overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Appt #</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Customer</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Issue</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Assigned To</th>
                <th className="text-center px-6 py-3 text-ink-3 font-medium">Status</th>
                <th className="text-left px-6 py-3 text-ink-3 font-medium">Date</th>
                <th className="text-right px-6 py-3 text-ink-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center"><Spinner className="mx-auto" /></td></tr>
              ) : calls.length === 0 ? (
                <tr><td colSpan={7}><EmptyState kind="empty" title="No appointments found" /></td></tr>
              ) : (
                calls.map((call) => (
                  <tr key={call._id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-6 py-3 tabular text-xs text-ink-3">{call.callNumber}</td>
                    <td className="px-6 py-3 font-medium text-ink">
                      {call.customerName}
                      <p className="text-ink-3 text-xs">{call.phone}</p>
                    </td>
                    <td className="px-6 py-3 text-ink-3">{call.subject}</td>
                    <td className="px-6 py-3 text-ink-3 text-xs">{call.assignedTo?.name || '—'}</td>
                    <td className="px-6 py-3 text-center">
                      <Badge tone={STATUS_TONE[call.status] ?? 'neutral'}>{call.status.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-6 py-3 text-ink-3">{fmtDate(call.createdAt)}</td>
                    <td className="px-6 py-3 text-right">
                      {!call.jobSheetId && call.status !== 'JOB_CREATED' && call.status !== 'CLOSED_LOST' && call.status !== 'NOT_INTERESTED' ? (
                        <Button size="sm" onClick={() => openConvert(call)} className="ml-auto">
                          <Wrench className="w-3.5 h-3.5" /> Convert to Workorder
                        </Button>
                      ) : (
                        <span className="text-ink-3 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>


      {convertingCall && (
        // `flex-1` on this backdrop (inside a `flex items-center
        // justify-center` parent) made it grow to fill the row and push
        // the actual dialog to the right edge of the screen instead of
        // centering it -- `absolute inset-0` takes it out of flex flow
        // entirely so `justify-center` on the parent centers the dialog
        // like it was always meant to.
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-bg/60" onClick={() => setConvertingCall(null)} />
          <div className="relative w-full max-w-md max-h-[90vh] bg-surface border border-border rounded-card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="h-section">Convert to Workorder</h2>
              <button onClick={() => setConvertingCall(null)} className="w-8 h-8 rounded-control bg-surface border border-border-strong flex items-center justify-center hover:bg-surface-2">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitConvert} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
              {convertError && (
                <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{convertError}</div>
              )}
              <p className="text-xs text-ink-3">{convertingCall.customerName} — {convertingCall.subject}</p>
              <Field label="Brand (leave blank to keep the appointment's)">
                <Select
                  value={convertForm.brandId}
                  onChange={(e) => setConvertForm((p) => ({ ...p, brandId: e.target.value, deviceModelId: '', deviceModel: '' }))}
                  title="Select brand"
                >
                  <option value="">Select…</option>
                  {brands.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Model">
                <Select
                  value={convertForm.deviceModelId}
                  onChange={(e) => {
                    const m = convertModels.find((mm) => mm._id === e.target.value)
                    setConvertForm((p) => ({ ...p, deviceModelId: e.target.value, deviceModel: m?.name || '' }))
                  }}
                  disabled={!convertForm.brandId || loadingConvertModels}
                  title="Select model"
                >
                  <option value="">{!convertForm.brandId ? 'Select a brand first' : loadingConvertModels ? 'Loading…' : 'Select…'}</option>
                  {convertModels.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
                </Select>
              </Field>
              <Field label="Fault Code">
                <Select
                  value={convertForm.faultCodeId}
                  onChange={(e) => setConvertForm((p) => ({ ...p, faultCodeId: e.target.value }))}
                  title="Select fault code"
                >
                  <option value="">Select…</option>
                  {faultCodes.map((f) => <option key={f._id} value={f._id}>{f.code} — {f.description}</option>)}
                </Select>
              </Field>
              <Field label="Warranty Status">
                <Select
                  value={convertForm.warrantyStatus}
                  onChange={(e) => setConvertForm((p) => ({ ...p, warrantyStatus: e.target.value }))}
                  title="Select warranty status"
                >
                  <option value="">Select…</option>
                  <option value="IW">In Warranty (IW)</option>
                  <option value="OOW">Out of Warranty (OOW)</option>
                </Select>
              </Field>
              <Field label="Device Appearance">
                <Select
                  value={convertForm.deviceAppearance}
                  onChange={(e) => setConvertForm((p) => ({ ...p, deviceAppearance: e.target.value }))}
                  title="Select device appearance"
                >
                  <option value="">Select…</option>
                  <option value="GOOD">Good</option>
                  <option value="USED">Used</option>
                  <option value="DENTS">Dents</option>
                  <option value="BROKEN">Broken</option>
                </Select>
              </Field>
              <Field label="File Backup Done?">
                <Select
                  value={convertForm.fileBackupDescription}
                  onChange={(e) => setConvertForm((p) => ({ ...p, fileBackupDescription: e.target.value }))}
                  title="Select whether file backup was done"
                >
                  <option value="">Select…</option>
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                </Select>
              </Field>
              <div className="px-0 pt-4 flex gap-3">
                <Button type="button" variant="secondary" onClick={() => setConvertingCall(null)} className="flex-1">Cancel</Button>
                <Button type="submit" disabled={converting} loading={converting} className="flex-1">Convert</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
