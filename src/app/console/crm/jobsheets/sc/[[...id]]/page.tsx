'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Trash2, Printer } from 'lucide-react'
import { validateGSTIN } from '@/lib/validation/gst'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from '@/core/catalog/deviceCategory'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * SC's entire workorder lifecycle -- intake through closure -- on ONE
 * screen, per explicit direction ("in single screen everything need to be
 * covered from login to closure entirely... drop modal from SC"). No
 * modal, no separate /new page, no separate /[id] detail page: this
 * route is /console/crm/jobsheets/sc (intake, no id yet) and
 * /console/crm/jobsheets/sc/<id> (same component, same screen, now
 * showing the live job) via a Next.js optional catch-all segment --
 * creating a job just swaps this screen from "intake" state into
 * "in-progress" state in place, it never navigates to a different page.
 *
 * Deliberately its own component, not a reuse of Brand's
 * console/crm/jobsheets/[id]/page.tsx -- that page carries Brand-only
 * concepts (engineer assignment, brand-job-number-for-part-order popup)
 * that don't apply to a single-tech shop. Reuses the same underlying
 * job-sheet API endpoints (start-repair/resume-repair/part-pending/close/
 * handover/cancel) since the lifecycle itself is the same workflow, just
 * presented without the multi-technician chrome.
 */

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
  _id: string; partName: string; partCode: string; unit: string; gstRate: number; rate: number
}

interface JobSheet {
  _id: string; jobSheetNumber: string; customerName: string; phone: string
  title: string; product?: string; deviceModel?: string; imeiOrSerialNumber?: string
  status: string; createdAt: string; lineItems: LineItem[]
  remark?: string; invoiceNumber?: string; cancelReason?: string
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  CREATED: 'info', REPAIR_STARTED: 'info', REPAIR_IN_PROGRESS: 'warning',
  PART_PENDING: 'warning', REPAIR_COMPLETED: 'info', CLOSED: 'success', CANCELLED: 'danger',
}

export default function SCJobSheetScreen() {
  const router = useRouter()
  const params = useParams()
  const idFromRoute = Array.isArray(params?.id) ? params.id[0] : undefined
  const { businessId } = useActiveBusinessId()

  const [jobId, setJobId] = useState<string | undefined>(idFromRoute)
  useEffect(() => { setJobId(idFromRoute) }, [idFromRoute])

  // ---------- Intake (no job yet) ----------
  const [intake, setIntake] = useState({
    customerName: '', phone: '', company: '', gstin: '',
    deviceCategory: '' as DeviceCategory | '', brandName: '', deviceModel: '', imeiOrSerialNumber: '',
    title: '', remark: '',
  })
  const [creating, setCreating] = useState(false)
  const [intakeError, setIntakeError] = useState<string | null>(null)

  async function createJobSheet(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) { setIntakeError('Select a business first (top-right business switcher).'); return }
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
          deviceCategory: intake.deviceCategory, pendingBrandName: intake.brandName,
          deviceModel: intake.deviceModel, imeiOrSerialNumber: intake.imeiOrSerialNumber,
          title: intake.title, remark: intake.remark, businessId,
        }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to create job sheet')
      // Swap this same screen into "in-progress" state -- no navigation to
      // a different page/experience, just the URL catching up so a
      // refresh or share link lands back on the same job.
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
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (job) { setLineItems(job.lineItems?.length ? job.lineItems : []); setRemark(job.remark || '') }
  }, [job?._id])

  const { data: bomPartsData } = useSWR(job ? '/api/service-center-bom' : null)
  const bomParts: BOMPart[] = bomPartsData?.success ? (bomPartsData.parts || []) : []

  function addLine() { setLineItems((prev) => [...prev, emptyLine()]) }
  function removeLine(i: number) { setLineItems((prev) => prev.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, patch: Partial<LineItem>) {
    setLineItems((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function pickBomPart(i: number, part: BOMPart) {
    updateLine(i, { description: part.partName, unit: part.unit, unitPrice: part.rate, taxRate: part.gstRate, serviceCenterBOMId: part._id })
  }

  async function saveLineItems() {
    if (!jobId) return
    setSaving(true); setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems, remark }),
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

  async function transition(action: 'start-repair' | 'resume-repair' | 'part-pending' | 'cancel', body?: object) {
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
        body: JSON.stringify({ lineItems, remark }),
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

  const inputCls = "w-full bg-surface border border-border rounded-control px-4 py-3 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
  const labelCls = "block text-sm font-medium text-ink-2 mb-2"

  // ---------- Intake screen ----------
  if (!jobId) {
    return (
      <div className="min-h-screen bg-bg text-ink p-6">
        <PageHeader
          title="New Job Sheet"
          description="Quick intake — this same screen carries the job through repair to closure."
          actions={<Button variant="secondary" onClick={() => router.push('/console/crm/jobsheets')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>}
        />
        <Card className="max-w-3xl p-8">
          <form onSubmit={createJobSheet} className="space-y-6">
            {intakeError && <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{intakeError}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Customer Name *</label>
                <input required value={intake.customerName} onChange={e => setIntake(p => ({ ...p, customerName: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Contact No *</label>
                <input required type="tel" value={intake.phone} onChange={e => setIntake(p => ({ ...p, phone: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Company <span className="text-ink-3 font-normal">(B2B customer)</span></label>
                <input value={intake.company} onChange={e => setIntake(p => ({ ...p, company: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>GSTIN</label>
                <input value={intake.gstin} onChange={e => setIntake(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} maxLength={15} className={`${inputCls} font-mono`} placeholder="22AAAAA0000A1Z5" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Device Category *</label>
              <select required value={intake.deviceCategory} onChange={e => setIntake(p => ({ ...p, deviceCategory: e.target.value as DeviceCategory | '' }))} className={inputCls}>
                <option value="">Select device type…</option>
                {DEVICE_CATEGORIES.map(c => <option key={c} value={c}>{DEVICE_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Brand</label>
                <input value={intake.brandName} onChange={e => setIntake(p => ({ ...p, brandName: e.target.value }))} className={inputCls} placeholder="e.g. Samsung" />
              </div>
              <div>
                <label className={labelCls}>Model</label>
                <input value={intake.deviceModel} onChange={e => setIntake(p => ({ ...p, deviceModel: e.target.value }))} className={inputCls} placeholder="e.g. Galaxy M14" />
              </div>
            </div>
            <p className="text-xs text-ink-3 -mt-3">Added straight to your shop's own catalog — no approval needed.</p>
            <div>
              <label className={labelCls}>IMEI / Serial Number</label>
              <input value={intake.imeiOrSerialNumber} onChange={e => setIntake(p => ({ ...p, imeiOrSerialNumber: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fault in Device *</label>
              <textarea required rows={3} value={intake.title} onChange={e => setIntake(p => ({ ...p, title: e.target.value }))} className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className={labelCls}>Remark</label>
              <input value={intake.remark} onChange={e => setIntake(p => ({ ...p, remark: e.target.value }))} className={inputCls} />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={creating} icon={creating ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              Create &amp; Continue
            </Button>
          </form>
        </Card>
      </div>
    )
  }

  // ---------- Loading the job ----------
  if (loading || !job) {
    return <LoadingPanel label="Loading workorder…" />
  }

  const total = lineItems.reduce((sum, l) => sum + lineTotal(l), 0)
  const isOpen = job.status !== 'CLOSED' && job.status !== 'CANCELLED'
  // Distinct from isOpen: once repair is complete and invoiced, there's
  // nothing left in the action bar except Cancel -- which shouldn't be
  // offered post-invoice anyway -- so it renders as an empty-looking card
  // if left under the same isOpen check as the earlier lifecycle stages.
  const showActionBar = isOpen && job.status !== 'REPAIR_COMPLETED'

  // ---------- In-progress / closure screen (same route, same component) ----------
  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title={job.jobSheetNumber}
        description={`${job.customerName} — ${[job.product, job.deviceModel].filter(Boolean).join(' · ') || 'Device'}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push('/console/crm/jobsheets')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
            <Button variant="secondary" onClick={() => router.push(`/print/jobsheets/${job._id}`)} icon={<Printer className="w-4 h-4" />}>Print</Button>
          </>
        }
      />

      <div className="flex items-center gap-3 mb-6">
        <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{job.status.replace(/_/g, ' ')}</Badge>
        {job.invoiceNumber && <span className="text-sm text-ink-3">Invoice {job.invoiceNumber}</span>}
      </div>

      {actionError && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{actionError}</div>}
      {job.status === 'CANCELLED' && job.cancelReason && (
        <div className="mb-6 text-sm text-ink-2 bg-surface-2 border border-border rounded-control px-4 py-3">Cancelled: {job.cancelReason}</div>
      )}

      <Card className="p-6 mb-6">
        <h3 className="text-base font-semibold text-ink mb-2">Fault Reported</h3>
        <p className="text-sm text-ink-2">{job.title}</p>
        {job.imeiOrSerialNumber && <p className="text-xs text-ink-3 mt-2">IMEI/Serial: {job.imeiOrSerialNumber}</p>}
      </Card>

      {isOpen && (
        <Card className="overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink">Parts &amp; Service Lines</h3>
            <Button variant="secondary" size="sm" onClick={addLine} icon={<Plus className="w-4 h-4" />}>Add Line</Button>
          </div>
          {lineItems.length === 0 ? (
            <p className="px-6 py-6 text-sm text-ink-3">No lines yet — add a part or service charge.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-2 text-ink-3 font-medium">Description</th>
                  <th className="text-center px-3 py-2 text-ink-3 font-medium w-20">Qty</th>
                  <th className="text-right px-3 py-2 text-ink-3 font-medium w-28">Rate</th>
                  <th className="text-right px-3 py-2 text-ink-3 font-medium w-24">Tax %</th>
                  <th className="text-right px-6 py-2 text-ink-3 font-medium w-28">Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lineItems.map((l, i) => (
                  <tr key={i}>
                    <td className="px-6 py-2">
                      <input list={`bom-parts-${i}`} value={l.description} onChange={e => updateLine(i, { description: e.target.value })} className={`${inputCls} py-2`} placeholder="Part / service name" />
                      <datalist id={`bom-parts-${i}`}>
                        {bomParts.map(p => <option key={p._id} value={p.partName} />)}
                      </datalist>
                    </td>
                    <td className="px-3 py-2"><input type="number" min={1} value={l.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) })} className={`${inputCls} py-2 text-center`} /></td>
                    <td className="px-3 py-2"><input type="number" min={0} value={l.unitPrice} onChange={e => updateLine(i, { unitPrice: Number(e.target.value) })} className={`${inputCls} py-2 text-right`} /></td>
                    <td className="px-3 py-2"><input type="number" min={0} value={l.taxRate} onChange={e => updateLine(i, { taxRate: Number(e.target.value) })} className={`${inputCls} py-2 text-right`} /></td>
                    <td className="px-6 py-2 text-right tabular text-ink font-medium">₹{lineTotal(l).toFixed(2)}</td>
                    <td className="px-3 py-2"><button onClick={() => removeLine(i)} className="text-ink-3 hover:text-danger"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <label className="text-sm text-ink-2">Remark</label>
            <input value={remark} onChange={e => setRemark(e.target.value)} className={`${inputCls} py-2 max-w-md`} />
          </div>
          <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-surface-2/40">
            <span className="text-sm text-ink-2">Total</span>
            <span className="text-lg font-semibold text-ink tabular">₹{total.toFixed(2)}</span>
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end">
            <Button variant="secondary" size="sm" onClick={saveLineItems} disabled={saving}>Save</Button>
          </div>
        </Card>
      )}

      {showActionBar && (
        <Card className="p-6">
          {(job.status === 'REPAIR_STARTED' || job.status === 'REPAIR_IN_PROGRESS') && (
            <div className="mb-4 max-w-sm">
              <label className={labelCls}>Engineer Name <span className="text-ink-3 font-normal">(prints on the closed job sheet)</span></label>
              <input value={engineerName} onChange={e => setEngineerName(e.target.value)} className={inputCls} placeholder="Who repaired this device" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {job.status === 'CREATED' && (
              <Button onClick={() => transition('start-repair')} disabled={saving}>Start Repair</Button>
            )}
            {job.status === 'PART_PENDING' && (
              <Button onClick={() => transition('resume-repair')} disabled={saving}>Resume Repair</Button>
            )}
            {(job.status === 'REPAIR_STARTED' || job.status === 'REPAIR_IN_PROGRESS') && (
              <Button variant="secondary" onClick={() => transition('part-pending')} disabled={saving}>Mark Part Pending</Button>
            )}
            {(job.status === 'REPAIR_STARTED' || job.status === 'REPAIR_IN_PROGRESS') && (
              <Button onClick={completeAndInvoice} disabled={saving}>Complete Repair &amp; Generate Invoice</Button>
            )}
            {job.status !== 'CANCELLED' && (
              <Button variant="secondary" onClick={() => { if (confirm('Cancel this job sheet?')) transition('cancel', { cancelReason: 'Cancelled by service center' }) }} disabled={saving} className="ml-auto text-danger">
                Cancel Job Sheet
              </Button>
            )}
          </div>
        </Card>
      )}

      {job.status === 'REPAIR_COMPLETED' && (
        <Card className="p-6 mt-6">
          <h3 className="text-base font-semibold text-ink mb-4">Handover &amp; Close</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
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
        <Card className="p-6 mt-6 text-center">
          <p className="text-sm text-ink-2">This job sheet is closed.</p>
        </Card>
      )}
    </div>
  )
}
