'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Trash2, Printer, FileText, Check } from 'lucide-react'
import { validateGSTIN } from '@/lib/validation/gst'
import { StateSelect, CitySelect, PincodeInput } from '@/components/shared/LocationSelect'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from '@/core/catalog/deviceCategory'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * SC's entire workorder lifecycle -- intake through closure -- on ONE
 * screen, per explicit direction. No modal, no separate /new page, no
 * separate /[id] detail page: this route is /console/crm/jobsheets/sc
 * (intake, no id yet) and /console/crm/jobsheets/sc/<id> (same component,
 * same screen) via a Next.js optional catch-all segment. Saving the
 * intake form creates the job at CREATED and stays on this same screen
 * (no auto-start) -- a milestone stepper + Print Workorder + "Proceed for
 * Repair" appear at the top. Proceeding self-assigns the current user as
 * engineer (CREATED -> REPAIR_STARTED) and immediately starts repair
 * (-> REPAIR_IN_PROGRESS), since SC has no separate "assign to a
 * different engineer" step the way Brand does.
 *
 * Deliberately its own component, not a reuse of Brand's
 * console/crm/jobsheets/[id]/page.tsx.
 */

const MILESTONES: { key: string; label: string }[] = [
  { key: 'CREATED', label: 'Created' },
  { key: 'REPAIR_IN_PROGRESS', label: 'In Progress' },
  { key: 'REPAIR_COMPLETED', label: 'Completed' },
  { key: 'CLOSED', label: 'Closed' },
]

interface LineItem {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  taxRate: number
  serviceCenterBOMId?: string
}
function emptyLine(): LineItem {
  return { description: '', quantity: 1, unit: 'PCS', unitPrice: 0, taxRate: 0 }
}
function lineTotal(l: LineItem): number {
  const base = (l.quantity || 0) * (l.unitPrice || 0)
  return base + base * ((l.taxRate || 0) / 100)
}

interface BOMPart {
  _id: string; partName: string; partCode: string; unit: string; gstRate: number; rate: number; partType?: string
}
interface Solution { _id: string; code: string; description: string }

interface JobSheet {
  _id: string; jobSheetNumber: string; customerName: string; phone: string; email?: string
  company?: string; gstin?: string
  address?: string; city?: string; state?: string; pincode?: string
  title: string; product?: string; deviceModel?: string; imeiOrSerialNumber?: string
  brandId?: { name?: string } | string
  status: string; createdAt: string; lineItems: LineItem[]
  remark?: string; ccoName?: string; invoiceNumber?: string; invoiceId?: string; cancelReason?: string
  engineerAssignedAt?: string; repairInProgressAt?: string; partPendingAt?: string; repairResumedAt?: string
  completedAt?: string; handedOverAt?: string
  solutionId?: { code?: string; description?: string } | string
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  CREATED: 'info', REPAIR_STARTED: 'info', REPAIR_IN_PROGRESS: 'warning',
  PART_PENDING: 'warning', REPAIR_COMPLETED: 'info', CLOSED: 'success', CANCELLED: 'danger',
}

const fmtDateTime = (d?: string) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null

function tatLabel(from?: string, to?: string) {
  if (!from) return null
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()
  const hours = ms / 3600000
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))}m`
  if (hours < 48) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function MilestoneStepper({ job }: { job: JobSheet }) {
  if (job.status === 'CANCELLED') {
    return <Badge tone="danger">Cancelled</Badge>
  }
  const stepDates: Record<string, string | undefined> = {
    CREATED: job.createdAt,
    REPAIR_IN_PROGRESS: job.repairInProgressAt || job.repairResumedAt,
    REPAIR_COMPLETED: job.completedAt,
    CLOSED: job.handedOverAt,
  }
  const effectiveStatus = job.status === 'REPAIR_STARTED' || job.status === 'PART_PENDING' ? 'REPAIR_IN_PROGRESS' : job.status
  const currentIdx = MILESTONES.findIndex(m => m.key === effectiveStatus)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {MILESTONES.map((m, i) => {
        const done = i <= currentIdx
        return (
          <div key={m.key} className="flex items-center gap-1">
            <div className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-control ${done ? 'bg-accent-soft' : 'bg-surface-2'}`}>
              <span className={`text-xs font-medium flex items-center gap-1 ${done ? 'text-accent-deep' : 'text-ink-3'}`}>
                {done && <Check className="w-3 h-3" />}{m.label}
              </span>
              {stepDates[m.key] && <span className="text-[10px] text-ink-3 tabular">{fmtDateTime(stepDates[m.key])}</span>}
            </div>
            {i < MILESTONES.length - 1 && <div className={`w-6 h-px ${i < currentIdx ? 'bg-accent' : 'bg-border'}`} />}
          </div>
        )
      })}
      {job.status === 'PART_PENDING' && <Badge tone="warning">Part Pending</Badge>}
    </div>
  )
}

export default function SCJobSheetScreen() {
  const router = useRouter()
  const params = useParams()
  const idFromRoute = Array.isArray(params?.id) ? params.id[0] : undefined
  const { businessId } = useActiveBusinessId()

  const [jobId, setJobId] = useState<string | undefined>(idFromRoute)
  useEffect(() => { setJobId(idFromRoute) }, [idFromRoute])

  const { data: meData } = useSWR('/api/auth/me')
  const currentUserId: string | null = meData?.user?.id ?? null
  const currentUserName: string = meData?.user?.name ?? ''

  const { data: businessData } = useSWR(businessId ? `/api/businesses/${businessId}` : null)
  const defaultLabourCharge: number = businessData?.business?.defaultLabourCharge || 0

  // ---------- Intake (no job yet) ----------
  const [intake, setIntake] = useState({
    customerName: '', phone: '', company: '', gstin: '',
    address: '', city: '', state: '', pincode: '',
    deviceCategory: '' as DeviceCategory | '', brandName: '', deviceModel: '', imeiOrSerialNumber: '',
    title: '', remark: '', ccoName: '',
  })
  useEffect(() => { if (currentUserName && !intake.ccoName) setIntake(p => ({ ...p, ccoName: currentUserName })) }, [currentUserName])

  const enabledDeviceCategories: DeviceCategory[] = businessData?.business?.enabledDeviceCategories?.length
    ? businessData.business.enabledDeviceCategories
    : DEVICE_CATEGORIES

  const [creating, setCreating] = useState(false)
  const [intakeError, setIntakeError] = useState<string | null>(null)

  async function createJobSheet(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) { setIntakeError('Select a business first (top-right business switcher).'); return }
    if (!intake.imeiOrSerialNumber.trim()) { setIntakeError('IMEI / Serial Number is required.'); return }
    if (intake.gstin.trim()) {
      const result = validateGSTIN(intake.gstin)
      if (!result.valid) { setIntakeError(`GSTIN: ${result.reason}`); return }
    }
    setCreating(true)
    setIntakeError(null)
    try {
      const res = await fetch('/api/crm/jobsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: intake.customerName, phone: intake.phone, company: intake.company, gstin: intake.gstin,
          address: intake.address, city: intake.city, state: intake.state, pincode: intake.pincode,
          deviceCategory: intake.deviceCategory, pendingBrandName: intake.brandName, deviceModel: intake.deviceModel,
          imeiOrSerialNumber: intake.imeiOrSerialNumber, title: intake.title, remark: intake.remark, ccoName: intake.ccoName,
          businessId,
        }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to create job sheet')
      setJobId(d.jobSheet._id)
      router.replace(`/console/crm/jobsheets/sc/${d.jobSheet._id}`)
    } catch (err: any) {
      setIntakeError(err.message || 'Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  // ---------- In-progress / closure (job exists) ----------
  const { data: jobRes, isLoading: loading, mutate: fetchJob } = useSWR(jobId ? `/api/crm/jobsheets/${jobId}` : null)
  const job: JobSheet | null = jobRes?.success ? jobRes.jobSheet : null

  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [remark, setRemark] = useState('')
  const [engineerRemark, setEngineerRemark] = useState('')
  const [solutionId, setSolutionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (job) {
      setLineItems(job.lineItems?.length ? job.lineItems : [])
      setRemark(job.remark || '')
      setSolutionId(typeof job.solutionId === 'object' ? '' : (job.solutionId as string) || '')
    }
  }, [job?._id])

  const { data: bomPartsData } = useSWR(job ? '/api/service-center-bom' : null)
  const bomParts: BOMPart[] = bomPartsData?.success ? (bomPartsData.parts || []) : []

  const { data: solutionsData, mutate: fetchSolutions } = useSWR(businessId ? `/api/solutions?businessId=${businessId}` : null)
  const solutions: Solution[] = solutionsData?.success ? (solutionsData.solutions || []) : (solutionsData?.solutions || [])

  const [showAddSolution, setShowAddSolution] = useState(false)
  const [newSolution, setNewSolution] = useState({ code: '', description: '' })
  const [savingSolution, setSavingSolution] = useState(false)

  async function addSolution() {
    if (!newSolution.code.trim() || !newSolution.description.trim()) return
    setSavingSolution(true)
    try {
      const res = await fetch('/api/solutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newSolution, businessId }),
      })
      const d = await res.json()
      if (d.success !== false && d.solution) {
        setSolutionId(d.solution._id)
        setNewSolution({ code: '', description: '' })
        setShowAddSolution(false)
        fetchSolutions()
      }
    } finally {
      setSavingSolution(false)
    }
  }

  function addLine() { setLineItems((prev) => [...prev, emptyLine()]) }
  function addLabourCharge() {
    setLineItems((prev) => [...prev, { description: 'Service / Labour Charge', quantity: 1, unit: 'PCS', unitPrice: defaultLabourCharge, taxRate: 0 }])
  }
  function removeLine(i: number) { setLineItems((prev) => prev.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, patch: Partial<LineItem>) {
    setLineItems((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function saveLineItems() {
    if (!jobId) return
    setSaving(true); setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems, remark, workPerformed: engineerRemark, solutionId: solutionId || undefined }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to save')
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function proceedForRepair() {
    if (!jobId || !currentUserId) return
    setSaving(true); setActionError(null)
    try {
      const assignRes = await fetch(`/api/crm/jobsheets/${jobId}/assign-engineer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engineerId: currentUserId }),
      })
      const assignData = await assignRes.json()
      if (!assignRes.ok || assignData.success === false) throw new Error(assignData.message || 'Failed to start repair')
      const startRes = await fetch(`/api/crm/jobsheets/${jobId}/start-repair`, { method: 'POST' })
      const startData = await startRes.json()
      if (!startRes.ok || startData.success === false) throw new Error(startData.message || 'Failed to start repair')
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function transition(action: 'resume-repair' | 'part-pending' | 'cancel', body?: object) {
    if (!jobId) return
    setSaving(true); setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${jobId}/${action}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Action failed')
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const [engineerName, setEngineerName] = useState('')

  async function completeAndInvoice() {
    if (!jobId) return
    if (!engineerName.trim()) { setActionError('Engineer name is required to complete the repair.'); return }
    setSaving(true); setActionError(null)
    try {
      const saveRes = await fetch(`/api/crm/jobsheets/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems, remark, workPerformed: engineerRemark, solutionId: solutionId || undefined }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok || saveData.success === false) throw new Error(saveData.message || 'Failed to save line items before closing')
      const res = await fetch(`/api/crm/jobsheets/${jobId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remark, engineerName }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to complete repair')
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const [paymentCollected, setPaymentCollected] = useState('')
  const [paymentMode, setPaymentMode] = useState('CASH')

  async function handover() {
    if (!jobId) return
    setSaving(true); setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${jobId}/handover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentCollected: Number(paymentCollected) || 0, paymentMode }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to hand over')
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full bg-surface border border-border rounded-control px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
  const labelCls = "block text-[11px] font-medium text-ink-2 mb-1"

  // ---------- Intake screen ----------
  if (!jobId) {
    return (
      <div className="min-h-screen bg-bg text-ink p-6">
        <PageHeader
          title="New Job Sheet"
          description="This same screen carries the job through repair to closure."
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => router.push('/console/crm/jobsheets')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
              <Button type="submit" form="sc-intake-form" size="sm" disabled={creating} icon={creating ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>Save</Button>
            </>
          }
        />
        <form id="sc-intake-form" onSubmit={createJobSheet} className="space-y-3">
          {intakeError && <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{intakeError}</div>}

          {/* Two columns so the screen actually uses its width instead of
              reading as one narrow stacked form with empty space beside it
              -- per explicit direction. Customer+Address (who/where) on the
              left, Device+Issue (what's being fixed) on the right. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <div className="space-y-3">
              <Card className="p-4 space-y-2.5">
                <h3 className="text-xs font-semibold text-ink">Customer</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Customer Name *</label>
                    <input required value={intake.customerName} onChange={e => setIntake(p => ({ ...p, customerName: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Contact No *</label>
                    <input required type="tel" value={intake.phone} onChange={e => setIntake(p => ({ ...p, phone: e.target.value }))} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Company <span className="text-ink-3 font-normal">(B2B customer)</span></label>
                    <input value={intake.company} onChange={e => setIntake(p => ({ ...p, company: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>GSTIN</label>
                    <input value={intake.gstin} onChange={e => setIntake(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} maxLength={15} className={`${inputCls} font-mono`} placeholder="22AAAAA0000A1Z5" />
                  </div>
                </div>
              </Card>

              <Card className="p-4 space-y-2.5">
                <h3 className="text-xs font-semibold text-ink">Address</h3>
                <div>
                  <label className={labelCls}>Address</label>
                  <input value={intake.address} onChange={e => setIntake(p => ({ ...p, address: e.target.value }))} className={inputCls} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={labelCls}>Pincode</label>
                    <PincodeInput
                      value={intake.pincode}
                      onChange={(value) => setIntake(p => ({ ...p, pincode: value }))}
                      onResolved={({ state, city }) => setIntake(p => ({ ...p, state: p.state || state, city: p.city || city }))}
                      placeholder="400001"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>State</label>
                    <StateSelect value={intake.state} onChange={(value) => setIntake(p => ({ ...p, state: value, city: '' }))} className={`${inputCls} appearance-none`} />
                  </div>
                  <div>
                    <label className={labelCls}>City</label>
                    <CitySelect value={intake.city} state={intake.state} onChange={(value) => setIntake(p => ({ ...p, city: value }))} className={inputCls} />
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-3">
              <Card className="p-4 space-y-2.5">
                <h3 className="text-xs font-semibold text-ink">Device</h3>
                <div>
                  <label className={labelCls}>Device Type *</label>
                  <select
                    required
                    value={intake.deviceCategory}
                    onChange={e => setIntake(p => ({ ...p, deviceCategory: e.target.value as DeviceCategory | '' }))}
                    className={inputCls}
                  >
                    <option value="">Select device type…</option>
                    {enabledDeviceCategories.map(c => <option key={c} value={c}>{DEVICE_CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                {/* Plain text, not the shared Brand/Series/Model/Variant
                    catalog tree -- that tree's "Request to add" flow is
                    gated behind CATALOG.CREATE (see
                    api/catalog/requests/route.ts), a permission this
                    account genuinely didn't have live, and Series/Variant
                    aren't needed for a single-tech shop's own free-text
                    catalog anyway. Posted as pendingBrandName, exactly
                    like the free-text stand-in the shared tree itself
                    uses while a request is pending -- SC's own catalog is
                    self-managed with no approval step regardless. */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Brand</label>
                    <input value={intake.brandName} onChange={e => setIntake(p => ({ ...p, brandName: e.target.value }))} className={inputCls} placeholder="e.g. Samsung" />
                  </div>
                  <div>
                    <label className={labelCls}>Model</label>
                    <input value={intake.deviceModel} onChange={e => setIntake(p => ({ ...p, deviceModel: e.target.value }))} className={inputCls} placeholder="e.g. Galaxy M14" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>IMEI / Serial Number *</label>
                  <input required value={intake.imeiOrSerialNumber} onChange={e => setIntake(p => ({ ...p, imeiOrSerialNumber: e.target.value }))} className={inputCls} />
                </div>
              </Card>

              <Card className="p-4 space-y-2.5">
                <h3 className="text-xs font-semibold text-ink">Issue</h3>
                <div>
                  <label className={labelCls}>Fault in Device *</label>
                  <textarea required rows={3} value={intake.title} onChange={e => setIntake(p => ({ ...p, title: e.target.value }))} className={`${inputCls} resize-none`} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Remark</label>
                    <input value={intake.remark} onChange={e => setIntake(p => ({ ...p, remark: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>CCO Name</label>
                    <input value={intake.ccoName} onChange={e => setIntake(p => ({ ...p, ccoName: e.target.value }))} className={inputCls} />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </form>
      </div>
    )
  }

  // ---------- Loading the job ----------
  if (loading || !job) {
    return <LoadingPanel label="Loading workorder…" />
  }

  const total = lineItems.reduce((sum, l) => sum + lineTotal(l), 0)
  const isOpen = job.status !== 'CLOSED' && job.status !== 'CANCELLED'
  const inRepair = job.status === 'REPAIR_STARTED' || job.status === 'REPAIR_IN_PROGRESS'
  const showActionBar = isOpen && job.status !== 'REPAIR_COMPLETED'
  const tat = tatLabel(job.createdAt, job.completedAt)

  // ---------- In-progress / closure screen (same route, same component) ----------
  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title={job.jobSheetNumber}
        description={`${job.customerName} — ${[job.product, job.deviceModel].filter(Boolean).join(' · ') || 'Device'}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push('/console/crm/jobsheets')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
            <Button variant="secondary" onClick={() => router.push(`/print/jobsheets/${job._id}`)} icon={<Printer className="w-4 h-4" />}>Print Workorder</Button>
            {inRepair && (
              <Button variant="secondary" onClick={() => router.push(`/print/jobsheets/${job._id}?doc=estimate`)} icon={<FileText className="w-4 h-4" />}>Print Estimate</Button>
            )}
            {(job.status === 'REPAIR_COMPLETED' || job.status === 'CLOSED') && (
              <>
                <Button variant="secondary" onClick={() => router.push(`/print/jobsheets/${job._id}/service-record`)} icon={<FileText className="w-4 h-4" />}>Service Order</Button>
                {job.invoiceId && (
                  <Button variant="secondary" onClick={() => router.push(`/console/crm/invoices/${job.invoiceId}`)} icon={<FileText className="w-4 h-4" />}>Invoice</Button>
                )}
              </>
            )}
            {job.status === 'CREATED' && (
              <Button onClick={proceedForRepair} disabled={saving}>Proceed for Repair</Button>
            )}
          </>
        }
      />

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <MilestoneStepper job={job} />
        {tat && <span className="text-xs text-ink-3">TAT: <span className="tabular text-ink-2 font-medium">{tat}</span>{!job.completedAt && ' (running)'}</span>}
      </div>

      {actionError && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{actionError}</div>}
      {job.status === 'CANCELLED' && job.cancelReason && (
        <div className="mb-6 text-sm text-ink-2 bg-surface-2 border border-border rounded-control px-4 py-3">Cancelled: {job.cancelReason}</div>
      )}

      <Card className="p-5 mb-6">
        <h3 className="text-sm font-semibold text-ink mb-2">Customer &amp; Device</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
          <div><span className="text-ink-3 text-xs">Customer</span><p className="text-ink">{job.customerName}</p></div>
          <div><span className="text-ink-3 text-xs">Phone</span><p className="text-ink">{job.phone}</p></div>
          <div><span className="text-ink-3 text-xs">Device</span><p className="text-ink">{[job.product, typeof job.brandId === 'object' ? job.brandId?.name : undefined, job.deviceModel].filter(Boolean).join(' · ') || '—'}</p></div>
          <div><span className="text-ink-3 text-xs">IMEI/Serial</span><p className="text-ink">{job.imeiOrSerialNumber || '—'}</p></div>
        </div>
        <div className="pt-3 border-t border-border">
          <span className="text-ink-3 text-xs">Fault Reported</span>
          <p className="text-sm text-ink-2">{job.title}</p>
        </div>
        {job.ccoName && <p className="text-xs text-ink-3 mt-2">Logged by (CCO): {job.ccoName}</p>}
      </Card>

      {isOpen && (
        <Card className="overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-ink">Parts &amp; Service Lines</h3>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={addLabourCharge} icon={<Plus className="w-4 h-4" />}>Add Service/Labour Charge</Button>
              <Button variant="secondary" size="sm" onClick={addLine} icon={<Plus className="w-4 h-4" />}>Add Line</Button>
            </div>
          </div>
          {bomParts.length === 0 && (
            <p className="px-5 py-2 text-xs text-warning bg-warning-soft border-b border-border">No materials found in your BOM yet — add parts under Material Catalog to have them listed here for quick selection.</p>
          )}
          {lineItems.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-3">No lines yet — add a part or service charge.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2 text-xs text-ink-3 font-medium">Description</th>
                  <th className="text-center px-2 py-2 text-xs text-ink-3 font-medium w-16">Qty</th>
                  <th className="text-right px-2 py-2 text-xs text-ink-3 font-medium w-24">Rate</th>
                  <th className="text-right px-2 py-2 text-xs text-ink-3 font-medium w-20">Tax %</th>
                  <th className="text-right px-5 py-2 text-xs text-ink-3 font-medium w-24">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lineItems.map((l, i) => (
                  <tr key={i}>
                    <td className="px-5 py-1.5">
                      <input list={`bom-parts-${i}`} value={l.description} onChange={e => updateLine(i, { description: e.target.value })} className={`${inputCls} py-1.5`} placeholder="Part / service name" />
                      <datalist id={`bom-parts-${i}`}>
                        {bomParts.map(p => <option key={p._id} value={p.partName} />)}
                      </datalist>
                    </td>
                    <td className="px-2 py-1.5"><input type="number" min={1} value={l.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) })} className={`${inputCls} py-1.5 text-center`} /></td>
                    <td className="px-2 py-1.5"><input type="number" min={0} value={l.unitPrice} onChange={e => updateLine(i, { unitPrice: Number(e.target.value) })} className={`${inputCls} py-1.5 text-right`} /></td>
                    <td className="px-2 py-1.5"><input type="number" min={0} value={l.taxRate} onChange={e => updateLine(i, { taxRate: Number(e.target.value) })} className={`${inputCls} py-1.5 text-right`} /></td>
                    <td className="px-5 py-1.5 text-right tabular text-ink font-medium text-xs">₹{lineTotal(l).toFixed(2)}</td>
                    <td className="px-2 py-1.5"><button onClick={() => removeLine(i)} className="text-ink-3 hover:text-danger"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-surface-2/40">
            <span className="text-sm text-ink-2">Total</span>
            <span className="text-sm font-semibold text-ink tabular">₹{total.toFixed(2)}</span>
          </div>
        </Card>
      )}

      {isOpen && inRepair && (
        <Card className="p-5 mb-6 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Engineer Remark &amp; Solution</h3>
          <div>
            <label className={labelCls}>Engineer Remark</label>
            <textarea rows={2} value={engineerRemark} onChange={e => setEngineerRemark(e.target.value)} className={`${inputCls} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className={labelCls}>Solution</label>
              <select value={solutionId} onChange={e => setSolutionId(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {solutions.map(s => <option key={s._id} value={s._id}>{s.code} — {s.description}</option>)}
              </select>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddSolution(v => !v)} icon={<Plus className="w-4 h-4" />}>Add Solution</Button>
          </div>
          {showAddSolution && (
            <div className="grid grid-cols-3 gap-2 items-end p-3 bg-surface-2/40 rounded-control">
              <div>
                <label className={labelCls}>Code</label>
                <input value={newSolution.code} onChange={e => setNewSolution(p => ({ ...p, code: e.target.value }))} className={inputCls} />
              </div>
              <div className="col-span-1">
                <label className={labelCls}>Description</label>
                <input value={newSolution.description} onChange={e => setNewSolution(p => ({ ...p, description: e.target.value }))} className={inputCls} />
              </div>
              <Button type="button" size="sm" onClick={addSolution} disabled={savingSolution}>Save Solution</Button>
            </div>
          )}
          <div>
            <label className={labelCls}>Remark</label>
            <input value={remark} onChange={e => setRemark(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Engineer Name <span className="text-ink-3 font-normal">(prints on the closed job sheet)</span></label>
            <input value={engineerName} onChange={e => setEngineerName(e.target.value)} className={inputCls} placeholder="Who repaired this device" />
          </div>
        </Card>
      )}

      {isOpen && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={saveLineItems} disabled={saving}>Save</Button>
            {job.status === 'PART_PENDING' && (
              <Button size="sm" onClick={() => transition('resume-repair')} disabled={saving}>Resume Repair</Button>
            )}
            {inRepair && (
              <Button variant="secondary" size="sm" onClick={() => transition('part-pending')} disabled={saving}>Mark Part Pending</Button>
            )}
            {inRepair && (
              <Button size="sm" onClick={completeAndInvoice} disabled={saving}>Complete Repair &amp; Generate Invoice</Button>
            )}
            {job.status !== 'CANCELLED' && (
              <Button variant="secondary" size="sm" onClick={() => { if (confirm('Cancel this job sheet?')) transition('cancel', { cancelReason: 'Cancelled by service center' }) }} disabled={saving} className="ml-auto text-danger">
                Cancel Job Sheet
              </Button>
            )}
          </div>
        </Card>
      )}

      {job.status === 'REPAIR_COMPLETED' && (
        <Card className="p-5 mt-6">
          <h3 className="text-sm font-semibold text-ink mb-3">Handover &amp; Close</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelCls}>Payment Collected</label>
              <input type="number" min={0} value={paymentCollected} onChange={e => setPaymentCollected(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Payment Mode</label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className={inputCls}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
              </select>
            </div>
          </div>
          <Button size="lg" className="w-full" onClick={handover} disabled={saving}>Hand Over to Customer &amp; Close</Button>
        </Card>
      )}

      {job.status === 'CLOSED' && (
        <Card className="p-5 mt-6 text-center">
          <p className="text-sm text-ink-2">This job sheet is closed.</p>
        </Card>
      )}
    </div>
  )
}
