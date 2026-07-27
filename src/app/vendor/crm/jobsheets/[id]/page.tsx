'use client'

import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Plus, Trash2, CheckCircle2, FileText, PauseCircle,
  Check, Wrench, Printer,
} from 'lucide-react'
import { formatAgeing } from '@/lib/format/ageing'

interface LineItem {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  taxRate: number
  hsnCode?: string
  serviceCenterBOMId?: string
  // Per-line diagnosis fields -- each item on the repair table gets its own
  // Fault Phenomenon/Symptom/Solution, per explicit direction, rather than
  // one shared set for the whole job sheet.
  faultCodeId?: string
  symptomCodeId?: string
  solutionId?: string
}

function lineCost(item: LineItem): number {
  const base = (item.quantity || 0) * (item.unitPrice || 0)
  return base + base * ((item.taxRate || 0) / 100)
}

interface BOMPart {
  _id: string
  partName: string
  partCode: string
  description?: string
  partType: 'SPARE_PART' | 'LABOUR' | 'CONSUMABLE'
  unit: string
  hsnCode: string
  gstRate: number
  rate: number
  brandId?: { _id: string; name: string } | string
  materialId?: string
}

interface Solution {
  _id: string
  code: string
  description: string
}

interface SymptomCode {
  _id: string
  code: string
  description: string
}

interface FaultCode {
  _id: string
  code: string
  description: string
}

interface JobSheet {
  _id: string
  jobSheetNumber: string
  businessId?: string
  customerName: string
  company?: string
  phone: string
  email?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  title: string
  description?: string
  product?: string
  deviceModel?: string
  imeiOrSerialNumber?: string
  brandId?: { _id?: string; name?: string } | string
  deviceModelId?: { _id?: string; name?: string } | string
  variantId?: { _id?: string; name?: string } | string
  faultCodeId?: { _id?: string } | string
  status: string
  createdAt: string
  lineItems: LineItem[]
  workPerformed?: string
  remark?: string
  invoiceId?: string
  invoiceNumber?: string
  brandJobNoForPartOrder?: string
  callId?: { callNumber?: string; status?: string } | string
  assignedTo?: { _id?: string; name?: string } | string
  cancelReason?: string
  warehouseId?: string
}

interface StaffMember {
  _id: string
  name?: string
  email?: string
  username?: string
}

// The milestone stepper -- the actual visual progress track that was
// missing entirely before (status was just a text label next to action
// buttons). CANCELLED is a branch, not a stage on the track itself.
const MILESTONES = [
  { key: 'CREATED', label: 'Created' },
  { key: 'REPAIR_STARTED', label: 'Assigned' },
  { key: 'REPAIR_IN_PROGRESS', label: 'In Repair' },
  { key: 'REPAIR_COMPLETED', label: 'Completed' },
  { key: 'CLOSED', label: 'Closed' },
] as const

function MilestoneStepper({ status }: { status: string }) {
  if (status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
        <PauseCircle className="w-4 h-4" /> Cancelled
      </div>
    )
  }
  if (status === 'PART_PENDING') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
        <PauseCircle className="w-4 h-4" /> Part Pending — repair paused, waiting on a part order
      </div>
    )
  }
  const currentIdx = MILESTONES.findIndex((m) => m.key === status)
  return (
    <div className="flex items-center w-full">
      {MILESTONES.map((m, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        return (
          <div key={m.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                done ? 'bg-emerald-600 border-emerald-600 text-white'
                : active ? 'bg-gray-900 border-gray-900 text-white'
                : 'bg-white border-gray-200 text-gray-300'
              }`}>
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-[11px] font-medium whitespace-nowrap ${active ? 'text-gray-900' : done ? 'text-emerald-700' : 'text-gray-400'}`}>
                {m.label}
              </span>
            </div>
            {i < MILESTONES.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < currentIdx ? 'bg-emerald-600' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ageingDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

export default function JobSheetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const { data: jobRes, error: jobFetchError, isLoading: loading, mutate: fetchJob } = useSWR(
    id ? `/api/crm/jobsheets/${id}` : null
  )
  const job: JobSheet | null = jobRes?.success === false ? null : (jobRes?.jobSheet ?? null)
  const error: string | null = jobFetchError
    ? (jobFetchError instanceof Error ? jobFetchError.message : 'Could not load workorder.')
    : (jobRes?.success === false ? (jobRes.message || 'Failed to load workorder') : null)

  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [serviceCharge, setServiceCharge] = useState(0)
  // Work Performed / job-level Symptom / job-level Solution were removed
  // from this page per explicit direction -- Symptom and Solution are now
  // per-line-item (see LineItem.symptomCodeId/solutionId above); workPerformed
  // itself is simply retired from this UI (the field stays on the schema
  // for older data/print pages, just no longer edited here).
  const [remark, setRemark] = useState('')
  // Brand Job No. -- moved here from the New Job Sheet creation form per
  // explicit direction ("Brand Job No should come at the time of Part
  // opening only, not while creating a new job sheet"): this is the
  // brand's own reference number needed when actually placing a parts
  // order, which only happens once repair work has started, not at
  // intake.
  const [brandJobNo, setBrandJobNo] = useState('')

  const { data: solutionsRes } = useSWR(job?.businessId ? `/api/solutions?businessId=${job.businessId}` : null)
  const solutions: Solution[] = solutionsRes?.solutions || []
  const { data: symptomCodesRes } = useSWR(job?.businessId ? `/api/symptom-codes?businessId=${job.businessId}` : null)
  const symptomCodes: SymptomCode[] = symptomCodesRes?.symptomCodes || []
  const { data: faultCodesRes } = useSWR(job?.businessId ? `/api/fault-codes?businessId=${job.businessId}` : null)
  const faultCodes: FaultCode[] = faultCodesRes?.faultCodes || []

  const [selectedEngineer, setSelectedEngineer] = useState('')
  const [assigning, setAssigning] = useState(false)

  const [showHandover, setShowHandover] = useState(false)
  const [paymentCollected, setPaymentCollected] = useState('')
  const [paymentMode, setPaymentMode] = useState('CASH')
  const [handingOver, setHandingOver] = useState(false)

  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // Job sheet's own Fault Code, chosen at creation or when converting a
  // call to a workorder -- used to prefill each new line item's Fault
  // Phenomenon, since most repairs start out addressing that same fault.
  const jobFaultCodeId = job?.faultCodeId ? (typeof job.faultCodeId === 'object' ? job.faultCodeId._id || '' : job.faultCodeId) : ''

  const emptyLine = useCallback((): LineItem => ({
    description: '', quantity: 1, unit: 'pcs', unitPrice: 0, taxRate: 0, faultCodeId: jobFaultCodeId || undefined,
  }), [jobFaultCodeId])

  // Line items come back with faultCodeId/symptomCodeId/solutionId
  // populated (object with code/description, for the print page) --
  // normalize each back to a plain id string here since the editable
  // dropdowns below compare against id strings, not populated objects.
  // Re-runs whenever the underlying job data changes (initial load, or
  // after any mutation action below calls fetchJob()/mutate()), mirroring
  // the old fetchJob()'s own state resets.
  useEffect(() => {
    if (!job) return
    const idOf = (v: any) => (v && typeof v === 'object' ? v._id : v) || undefined
    const normalizedLines = (job.lineItems || []).map((l: any) => ({
      ...l,
      faultCodeId: idOf(l.faultCodeId),
      symptomCodeId: idOf(l.symptomCodeId),
      solutionId: idOf(l.solutionId),
    }))
    setLineItems(normalizedLines.length ? normalizedLines : [{
      description: '', quantity: 1, unit: 'pcs', unitPrice: 0, taxRate: 0,
      faultCodeId: idOf(job.faultCodeId),
    }])
    setServiceCharge((job as any).serviceCharge || 0)
    setRemark(job.remark || '')
    setBrandJobNo(job.brandJobNoForPartOrder || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job])

  // Fixed Service Charge editing is restricted to Owner/Manager, per
  // explicit direction -- everyone else sees it read-only.

  // Serialized-inventory stock check on part add -- only meaningful when
  // the active business has Business.inventorySerialized = true (see
  // models/Business.ts). Fetched once the job sheet's businessId is known.
  const { data: businessRes } = useSWR(job?.businessId ? `/api/businesses/${job.businessId}` : null)
  const inventorySerialized = Boolean(businessRes?.business?.inventorySerialized)
  // Fallback rate for "Add Labour Charge" when this vendor has no
  // LABOUR-type BOM entry of its own -- set by Owner/Manager at
  // Vendor > Profile > Business Settings.
  const defaultLabourCharge = Number(businessRes?.business?.defaultLabourCharge) || 0

  // Brand Job No. popup -- fires the first time a BOM part is added to
  // this job sheet while brandJobNo is still empty, per explicit direction
  // ("if any call moving to part pending then a popup should come to fill
  // brand job number if required else you can leave"). Optional -- can be
  // dismissed without filling it in.
  const [showBrandJobPopup, setShowBrandJobPopup] = useState(false)
  // When opened via "Mark Part Pending" (vs. the auto-prompt on first BOM
  // part add), confirming actually transitions the job status too.
  const [markingPartPending, setMarkingPartPending] = useState(false)
  const [stockWarning, setStockWarning] = useState<string | null>(null)

  const { data: meData } = useSWR('/api/auth/me')
  const meUser = meData?.user ?? meData
  const meRole = String(meUser?.role || '').toUpperCase()
  const canEditServiceCharge = Boolean(meUser?.isSuperAdmin) || meRole.includes('OWNER') || meRole.includes('MANAGER')
  const currentUserId: string | null = meUser?.id || null
  const isSuperAdminUser = Boolean(meUser?.isSuperAdmin)

  // Per explicit direction: the actual repair content (line items, remark)
  // must be filled by the assigned engineer only, not the CCO -- same
  // restriction already enforced for start/resume/pause repair actions
  // (see requireAssignedEngineer), mirrored here at the API level too
  // (this is just the UI reflecting it).
  const assignedToId = job?.assignedTo ? (typeof job.assignedTo === 'object' ? job.assignedTo._id : job.assignedTo) : null
  const isAssignedEngineer = isSuperAdminUser || (!!assignedToId && assignedToId === currentUserId)

  const { data: engineersRes } = useSWR(id ? `/api/crm/jobsheets/${id}/engineers` : null)
  const engineers: StaffMember[] = engineersRes?.success ? (engineersRes.engineers || []) : []

  // Vendor's Service Center BOM parts — filtered server-side to this
  // workorder's device brand (plus brand-agnostic parts) so the picker
  // isn't a flat unfiltered dump of every part the vendor stocks.
  const idOfRef = (v: any): string | undefined => (v && typeof v === 'object' ? v._id : v) || undefined
  const bomBrandId = idOfRef(job?.brandId)
  const bomDeviceModelId = idOfRef(job?.deviceModelId)
  const bomKey = (() => {
    if (!job) return null
    const params = new URLSearchParams()
    if (bomBrandId) params.set('brandId', bomBrandId)
    if (bomDeviceModelId) params.set('deviceModelId', bomDeviceModelId)
    const qs = params.toString()
    return `/api/service-center-bom${qs ? `?${qs}` : ''}`
  })()
  const { data: bomRes } = useSWR(bomKey)
  const bomParts: BOMPart[] = bomRes?.success ? (bomRes.parts || []) : []

  function updateLine(i: number, updates: Partial<LineItem>) {
    setLineItems((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...updates } : l)))
  }
  function addLine() { setLineItems((prev) => [...prev, emptyLine()]) }
  function removeLine(i: number) { setLineItems((prev) => prev.filter((_, idx) => idx !== i)) }

  // Available stock per line, keyed by line index -- only populated when
  // inventory is serialized (see the Inventory Qty column). null = not
  // checked/not applicable for this line's part.
  const [lineStock, setLineStock] = useState<Record<number, number | null>>({})

  async function pickBomPart(i: number, part: BOMPart) {
    setStockWarning(null)
    setLineStock((prev) => { const next = { ...prev }; delete next[i]; return next })
    if (inventorySerialized && part.materialId) {
      try {
        const qs = job?.warehouseId ? `?warehouseId=${job.warehouseId}` : ''
        const res = await fetch(`/api/service-center-bom/${part._id}/stock${qs}`)
        const d = await res.json()
        if (d.success && d.tracked) {
          setLineStock((prev) => ({ ...prev, [i]: d.availableQuantity ?? 0 }))
          if ((d.availableQuantity ?? 0) <= 0) {
            setStockWarning(`"${part.partName}" is out of stock (0 available) -- add it anyway only if you're sure, otherwise maintain sufficient stock first.`)
          }
        }
      } catch { /* best-effort check -- don't block on a network hiccup */ }
    }

    updateLine(i, {
      description: part.partName,
      unitPrice: part.rate,
      hsnCode: part.hsnCode,
      serviceCenterBOMId: part._id,
      taxRate: part.gstRate,
      unit: part.unit,
    })
    // Popup only opens from "Mark Part Pending" now, per explicit
    // direction -- it used to also auto-fire the first time any BOM part
    // was picked, which fired constantly for parts that never end up
    // needing an actual parts order.
  }

  function onDescriptionSelect(i: number, bomId: string) {
    if (!bomId) {
      updateLine(i, { description: '', unitPrice: 0, hsnCode: undefined, serviceCenterBOMId: undefined, taxRate: 0, unit: 'pcs' })
      return
    }
    const part = bomParts.find((p) => p._id === bomId)
    if (part) pickBomPart(i, part)
  }

  // "1-click add a labour/service-charge line" -- picks the vendor's own
  // LABOUR-type BOM entry if one exists (so the rate is whatever the
  // vendor configured on that part), else falls back to the Owner/
  // Manager-configured Default Labour Charge (Settings > Business
  // Settings), or a blank editable-via-BOM-pick line at 0 if neither is set.
  function addLabourCharge() {
    const labourPart = bomParts.find((p) => p.partType === 'LABOUR')
    setLineItems((prev) => [...prev, {
      description: labourPart?.partName || 'Labour / Service Charge',
      quantity: 1,
      unit: labourPart?.unit || 'nos',
      unitPrice: labourPart?.rate ?? defaultLabourCharge,
      taxRate: labourPart?.gstRate ?? 18,
      hsnCode: labourPart?.hsnCode,
      serviceCenterBOMId: labourPart?._id,
      faultCodeId: jobFaultCodeId || undefined,
    }])
  }

  const isLocked = job?.status === 'REPAIR_COMPLETED' || job?.status === 'CLOSED' || job?.status === 'CANCELLED'

  // Job-sheet-level symptomCodeId/solutionId (still on the schema, still
  // read by the Service Record print page) are derived from the line
  // items at save time -- the last line with a value set wins -- so that
  // page keeps working even though Symptom/Solution are now chosen per
  // line item rather than once for the whole job sheet.
  function derivedSymptomCodeId(): string | null {
    for (let i = lineItems.length - 1; i >= 0; i--) {
      if (lineItems[i].symptomCodeId) return lineItems[i].symptomCodeId as string
    }
    return null
  }
  function derivedSolutionId(): string | null {
    for (let i = lineItems.length - 1; i >= 0; i--) {
      if (lineItems[i].solutionId) return lineItems[i].solutionId as string
    }
    return null
  }

  async function saveLineItems(extra: Record<string, unknown> = {}) {
    setSaving(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems, remark, brandJobNoForPartOrder: brandJobNo || null, solutionId: derivedSolutionId(), symptomCodeId: derivedSymptomCodeId(), serviceCharge, ...extra }),
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

  async function assignEngineer() {
    if (!selectedEngineer) return
    setAssigning(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${id}/assign-engineer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engineerId: selectedEngineer }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to assign engineer')
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setAssigning(false)
    }
  }

  async function startRepair() {
    setSaving(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${id}/start-repair`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to start repair')
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function resumeRepair() {
    setSaving(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${id}/resume-repair`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to resume repair')
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function confirmPartPending() {
    setMarkingPartPending(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${id}/part-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandJobNoForPartOrder: brandJobNo || null }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to mark part pending')
      setShowBrandJobPopup(false)
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setMarkingPartPending(false)
    }
  }

  async function completeRepair() {
    setClosing(true)
    setActionError(null)
    try {
      // Persist any pending edits first so completion invoices the latest
      // line items -- this response was never checked, so a save that
      // failed (e.g. a line item missing its required description) failed
      // SILENTLY and close then read whatever was already in the DB
      // (often nothing), surfacing as "no line items" even right after
      // visibly adding some in the UI.
      const saveRes = await fetch(`/api/crm/jobsheets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems, remark, solutionId: derivedSolutionId(), symptomCodeId: derivedSymptomCodeId(), serviceCharge }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok || saveData.success === false) {
        throw new Error(saveData.message || 'Failed to save line items before closing')
      }
      const res = await fetch(`/api/crm/jobsheets/${id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remark }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to complete repair')
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setClosing(false)
    }
  }

  async function submitHandover() {
    setHandingOver(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${id}/handover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentCollected: parseFloat(paymentCollected) || 0, paymentMode }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to hand over')
      setShowHandover(false)
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setHandingOver(false)
    }
  }

  async function submitCancel() {
    if (!cancelReason.trim()) return
    setCancelling(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelReason }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to cancel')
      setShowCancel(false)
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-gray-500 animate-spin" /></div>
  }
  if (error || !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-red-600 text-sm">{error || 'Workorder not found'}</p>
        <button onClick={() => router.push('/vendor/crm/jobsheets')} className="text-sm text-gray-500 underline">Back to Workorders</button>
      </div>
    )
  }

  const subtotal = lineItems.reduce((s, l) => s + (l.quantity || 0) * (l.unitPrice || 0), 0)
  const taxTotal = lineItems.reduce((s, l) => s + ((l.quantity || 0) * (l.unitPrice || 0)) * ((l.taxRate || 0) / 100), 0)
  const grandTotal = subtotal + taxTotal + (serviceCharge || 0)
  const days = ageingDays(job.createdAt)
  const isOpen = job.status !== 'CLOSED' && job.status !== 'CANCELLED'
  const overdue = isOpen && days >= 7
  const deviceLine = [job.product, typeof job.brandId === 'object' ? job.brandId?.name : undefined, job.deviceModel, typeof job.variantId === 'object' ? job.variantId?.name : undefined].filter(Boolean).join(' · ')

  // Shared cell width classes for the Line Items table -- a flex row
  // instead of Tailwind's grid-cols-N (capped at 12 by default) since this
  // table now has more columns than that (Fault Phenomenon/Symptom/
  // Solution/Description/Material Code/Qty/[Inv Qty]/Rate/Tax/Cost/Delete).
  const CELL = {
    // flex-1 + a min-width (not a fixed w-*) so the row actually stretches
    // to fill the card's full width instead of leaving space unused on the
    // right -- was hard-coded narrow widths that summed to less than the
    // container, and were too tight for "CODE — Description" values to be
    // readable at all.
    faultCode: 'flex-1 min-w-[160px]',
    symptom: 'flex-1 min-w-[160px]',
    solution: 'flex-1 min-w-[160px]',
    description: 'flex-[1.6] min-w-[220px]',
    materialCode: 'w-28 shrink-0',
    qty: 'w-16 shrink-0',
    invQty: 'w-20 shrink-0',
    rate: 'w-24 shrink-0',
    tax: 'w-20 shrink-0',
    cost: 'w-24 shrink-0',
    delete: 'w-8 shrink-0',
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="px-6 py-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/vendor/crm/jobsheets')} className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold font-mono">{job.jobSheetNumber}</h1>
            <p className="text-sm text-gray-400">
              {job.customerName} · {job.title}
              {deviceLine && <> · {deviceLine}</>}
            </p>
          </div>
          {isOpen && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${overdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
              {formatAgeing(job.createdAt)} open
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {/* Reuses the existing print route rather than duplicating it --
                it's a standalone print view (opens in a new tab), not part
                of the admin shell's navigation. */}
            <button
              onClick={() => window.open(
                job.status === 'CLOSED'
                  ? `/print/jobsheets/${id}/service-record`
                  : `/print/jobsheets/${id}/intake-receipt`,
                '_blank'
              )}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-100 transition"
            >
              <Printer className="w-4 h-4" /> {job.status === 'CLOSED' ? 'Print Service Record' : 'Print Workorder'}
            </button>
            <button
              onClick={() => window.open(`/print/jobsheets/${id}?doc=estimate`, '_blank')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-100 transition"
            >
              <Printer className="w-4 h-4" /> Print Estimate
            </button>
            {job.invoiceId && (
              // No vendor-side invoice detail page exists -- /vendor/invoices
              // only ever lists marketplace product-sale invoices (its own
              // API hardcodes invoiceType:"B2B" and filters by vendorId,
              // which CRM-closed job sheet invoices never carry), so a
              // job-sheet Bill/Invoice would never actually show up there.
              // The printable /invoice/[invoiceNumber] page works off just
              // the invoice number with no vendor-context requirement, so
              // link there directly instead of that dead end.
              <button
                onClick={() => window.open(`/invoice/${job.invoiceNumber}`, '_blank')}
                className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-800 transition"
              >
                {/* NON_GST_INVOICE ("BILL-...") means no company name and
                    no tax -- a plain Bill, not a Tax/B2B Invoice. See
                    core/numbering/types.ts's PREFIXES and the isB2B/
                    zeroTaxForB2C branch in api/crm/jobsheets/[id]/close. */}
                <FileText className="w-4 h-4" />
                {job.invoiceNumber?.startsWith('BILL') ? 'View Bill' : 'View Invoice'} ({job.invoiceNumber})
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Customer</h3>
            <div className="space-y-1.5 text-sm text-gray-700">
              <p className="font-medium text-gray-900">{job.customerName}</p>
              {job.company && <p className="text-gray-500">{job.company}</p>}
              <p>{job.phone}{job.email ? ` · ${job.email}` : ''}</p>
              {(job.address || job.city || job.state || job.pincode) && (
                <p className="text-gray-500">
                  {[job.address, job.city, job.state, job.pincode].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Device & Reported Issue</h3>
            <div className="space-y-1.5 text-sm text-gray-700">
              <p className="font-medium text-gray-900">{deviceLine || '—'}</p>
              {job.imeiOrSerialNumber && <p className="text-gray-500 font-mono text-xs">IMEI/SN: {job.imeiOrSerialNumber}</p>}
              <p className="text-gray-500">{job.title}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-6">
          <MilestoneStepper status={job.status} />
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {job.status === 'CREATED' && (
            <>
              <select
                value={selectedEngineer}
                onChange={(e) => setSelectedEngineer(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700"
              >
                <option value="">Select engineer…</option>
                {engineers.map((e) => (
                  <option key={e._id} value={e._id}>{e.name || e.email}</option>
                ))}
              </select>
              <button onClick={assignEngineer} disabled={assigning || !selectedEngineer} className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-100 transition disabled:opacity-50">
                {assigning ? 'Assigning…' : 'Assign Engineer'}
              </button>
            </>
          )}
          {job.status === 'REPAIR_STARTED' && (
            <button onClick={startRepair} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-100 transition">
              <Wrench className="w-4 h-4" /> Start Repair
            </button>
          )}
          {job.status === 'REPAIR_IN_PROGRESS' && (
            <>
              <button
                onClick={completeRepair}
                disabled={closing || lineItems.every((l) => !l.description.trim())}
                className="flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Complete Repair & Generate Invoice
              </button>
              <button
                onClick={() => setShowBrandJobPopup(true)}
                disabled={markingPartPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800 hover:bg-amber-100 transition disabled:opacity-50"
              >
                <PauseCircle className="w-4 h-4" /> Mark Part Pending
              </button>
            </>
          )}
          {job.status === 'PART_PENDING' && (
            <button onClick={resumeRepair} disabled={saving} className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-800 transition disabled:opacity-50">
              <Wrench className="w-4 h-4" /> Part Arrived — Resume Repair
            </button>
          )}
          {job.status === 'REPAIR_COMPLETED' && (
            <button onClick={() => setShowHandover(true)} className="flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-emerald-700 transition">
              <CheckCircle2 className="w-4 h-4" /> Handover to Customer
            </button>
          )}
          {job.status !== 'CLOSED' && job.status !== 'CANCELLED' && (
            <button onClick={() => setShowCancel(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700 hover:bg-red-100 transition">
              <PauseCircle className="w-4 h-4" /> Cancel
            </button>
          )}
        </div>

        {actionError && <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{actionError}</div>}

        {job.status === 'CANCELLED' && job.cancelReason && (
          <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            Cancelled — Reason: {job.cancelReason}
          </div>
        )}

        {stockWarning && (
          <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
            <span>{stockWarning}</span>
            <button onClick={() => setStockWarning(null)} className="text-amber-600 hover:text-amber-800 shrink-0">✕</button>
          </div>
        )}

        {job.status === 'CREATED' ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-6 text-center py-12">
            <Wrench className="w-8 h-8 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">Assign an engineer above to begin repair work.</p>
            <p className="text-xs text-gray-400 mt-1">Parts, symptoms, solutions and service charge become available once someone is assigned.</p>
          </div>
        ) : (
        <>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-6 overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Service Info</h3>
            {!isLocked && isAssignedEngineer && (
              <div className="flex items-center gap-3">
                <button onClick={addLabourCharge} className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                  <Wrench className="w-3.5 h-3.5" /> Add Labour Charge
                </button>
                <button onClick={addLine} className="flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900">
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </div>
            )}
          </div>
          {!isLocked && !isAssignedEngineer && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              Only the assigned engineer can add or edit line items on this workorder.
            </p>
          )}
          {!isLocked && isAssignedEngineer && bomParts.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              No parts found in Service Center BOM for this device's brand/model.{' '}
              <button type="button" onClick={() => router.push('/vendor/service-bom')} className="underline font-medium hover:text-amber-800">
                Add some there
              </button>{' '}
              before picking a part here.
            </p>
          )}

          <div className="w-full">
            <div className="flex gap-2 px-2 pb-1 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
              <span className={CELL.faultCode}>Fault Phenomenon</span>
              <span className={CELL.symptom}>Symptom</span>
              <span className={CELL.solution}>Solution</span>
              <span className={CELL.description}>Description</span>
              <span className={CELL.materialCode}>Material Code</span>
              <span className={CELL.qty}>Qty</span>
              {inventorySerialized && <span className={CELL.invQty}>Inv. Qty</span>}
              <span className={CELL.rate}>Rate</span>
              <span className={CELL.tax}>Tax %</span>
              <span className={CELL.cost}>Cost</span>
              <span className={CELL.delete} />
            </div>

            <div className="space-y-2">
              {lineItems.map((item, i) => {
                const disabledLine = isLocked || !isAssignedEngineer
                return (
                <div key={i} className="border border-gray-100 rounded-lg p-2">
                  <div className="flex gap-2 items-center">
                    <select
                      disabled={disabledLine}
                      value={item.faultCodeId || ''}
                      onChange={(e) => updateLine(i, { faultCodeId: e.target.value || undefined })}
                      className={`${CELL.faultCode} border border-gray-200 rounded-lg px-2 py-2 text-sm disabled:bg-gray-50`}
                    >
                      <option value="">— None —</option>
                      {faultCodes.map((f) => (
                        <option key={f._id} value={f._id}>{f.code} — {f.description}</option>
                      ))}
                    </select>
                    <select
                      disabled={disabledLine}
                      value={item.symptomCodeId || ''}
                      onChange={(e) => updateLine(i, { symptomCodeId: e.target.value || undefined })}
                      className={`${CELL.symptom} border border-gray-200 rounded-lg px-2 py-2 text-sm disabled:bg-gray-50`}
                    >
                      <option value="">— None —</option>
                      {symptomCodes.map((s) => (
                        <option key={s._id} value={s._id}>{s.code} — {s.description}</option>
                      ))}
                    </select>
                    <select
                      disabled={disabledLine}
                      value={item.solutionId || ''}
                      onChange={(e) => updateLine(i, { solutionId: e.target.value || undefined })}
                      className={`${CELL.solution} border border-gray-200 rounded-lg px-2 py-2 text-sm disabled:bg-gray-50`}
                    >
                      <option value="">— None —</option>
                      {solutions.map((s) => (
                        <option key={s._id} value={s._id}>{s.code} — {s.description}</option>
                      ))}
                    </select>
                    <select
                      disabled={disabledLine}
                      value={item.serviceCenterBOMId || ''}
                      onChange={(e) => onDescriptionSelect(i, e.target.value)}
                      title={bomParts.length === 0 ? 'No BOM parts configured for this vendor/brand yet' : undefined}
                      className={`${CELL.description} border border-gray-200 rounded-lg px-2 py-2 text-sm disabled:bg-gray-50`}
                    >
                      <option value="">{item.description || 'Select part/labour…'}</option>
                      {bomParts.map((p) => (
                        <option key={p._id} value={p._id}>{p.partName} ({p.partCode})</option>
                      ))}
                    </select>
                    <input
                      disabled
                      placeholder="—"
                      value={bomParts.find((p) => p._id === item.serviceCenterBOMId)?.partCode || ''}
                      title="Auto-filled from the selected BOM part"
                      className={`${CELL.materialCode} border border-gray-200 rounded-lg px-2 py-2 text-sm bg-gray-50 text-gray-500 font-mono`}
                    />
                    <input
                      disabled
                      type="number"
                      placeholder="Qty"
                      value={1}
                      title="Quantity is fixed at 1 per line -- add another line for more"
                      className={`${CELL.qty} border border-gray-200 rounded-lg px-2 py-2 text-sm bg-gray-50 text-gray-500`}
                    />
                    {inventorySerialized && (
                      <input
                        disabled
                        placeholder="—"
                        value={lineStock[i] != null ? String(lineStock[i]) : ''}
                        title="Available stock for this part, at the moment it was selected"
                        className={`${CELL.invQty} border rounded-lg px-2 py-2 text-sm bg-gray-50 ${lineStock[i] === 0 ? 'border-red-200 text-red-500' : 'border-gray-200 text-gray-500'}`}
                      />
                    )}
                    <input
                      disabled
                      type="number"
                      placeholder="—"
                      value={item.unitPrice}
                      title="Auto-filled from the selected BOM part"
                      className={`${CELL.rate} border border-gray-200 rounded-lg px-2 py-2 text-sm bg-gray-50 text-gray-500`}
                    />
                    <input
                      disabled
                      type="number"
                      placeholder="—"
                      value={item.taxRate}
                      title="Auto-filled from the selected BOM part"
                      className={`${CELL.tax} border border-gray-200 rounded-lg px-2 py-2 text-sm bg-gray-50 text-gray-500`}
                    />
                    <input
                      disabled
                      placeholder="—"
                      value={`₹${lineCost(item).toLocaleString('en-IN')}`}
                      title="Qty x Rate, plus tax"
                      className={`${CELL.cost} border border-gray-200 rounded-lg px-2 py-2 text-sm bg-gray-50 text-gray-600 font-medium`}
                    />
                    {!isLocked && isAssignedEngineer && (
                      <button onClick={() => removeLine(i)} className={`${CELL.delete} flex justify-center text-red-400 hover:text-red-600`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {item.hsnCode && (
                    <p className="mt-1 text-[11px] text-gray-400 pl-1">HSN: {item.hsnCode}</p>
                  )}
                </div>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-end mt-4 gap-2 text-sm">
            <label className="text-gray-500">Service Charge:</label>
            <span className="text-gray-400">₹</span>
            <input
              type="number"
              disabled={isLocked || !canEditServiceCharge}
              value={serviceCharge}
              onChange={(e) => setServiceCharge(parseFloat(e.target.value) || 0)}
              onFocus={(e) => e.target.select()}
              title={canEditServiceCharge ? undefined : 'Only an Owner or Manager can edit the service charge'}
              className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div className="flex justify-end mt-2 text-sm text-gray-600 gap-6">
            <span>Subtotal: ₹{subtotal.toLocaleString('en-IN')}</span>
            <span>Tax: ₹{taxTotal.toLocaleString('en-IN')}</span>
            <span>Service Charge: ₹{(serviceCharge || 0).toLocaleString('en-IN')}</span>
            <span className="font-semibold text-gray-900">Total: ₹{grandTotal.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Remark</label>
            <textarea
              disabled={isLocked || !isAssignedEngineer}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Any additional remark about this repair"
              rows={2}
              title={isAssignedEngineer ? undefined : 'Only the assigned engineer can edit this'}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm disabled:bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Brand Job No. (for part order)</label>
            <input
              disabled={isLocked}
              value={brandJobNo}
              onChange={(e) => setBrandJobNo(e.target.value)}
              placeholder="Enter once a part order is actually being placed"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm disabled:bg-gray-50"
            />
          </div>
          {!isLocked && isAssignedEngineer && (
            <button onClick={() => saveLineItems()} disabled={saving} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
        </>
        )}
      </div>

      {showHandover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-2">Handover to Customer</h2>
            <p className="text-xs text-gray-500 mb-4">Record what was collected before closing this workorder.</p>
            <input
              type="number"
              value={paymentCollected}
              onChange={(e) => setPaymentCollected(e.target.value)}
              placeholder="Amount collected"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 mb-3"
            />
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 mb-4"
            >
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="OTHER">Other</option>
            </select>
            <div className="flex gap-3">
              <button onClick={() => setShowHandover(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-500">Cancel</button>
              <button onClick={submitHandover} disabled={handingOver || !paymentCollected} className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                {handingOver ? 'Saving…' : 'Confirm Handover'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-2">Cancel Workorder</h2>
            <p className="text-xs text-gray-500 mb-4">This will be routed to the manager. Provide a reason.</p>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Cancellation reason"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowCancel(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-500">Back</button>
              <button onClick={submitCancel} disabled={cancelling || !cancelReason.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
                {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Only ever opened from "Mark Part Pending" now -- used to also
          auto-fire on the first BOM part pick. */}
      {showBrandJobPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-2">Brand Job Number</h2>
            <p className="text-xs text-gray-500 mb-4">
              If this brand requires their own job reference number for the part order, enter it now. Leave blank if not required, then confirm to mark this workorder Part Pending.
            </p>
            <input
              value={brandJobNo}
              onChange={(e) => setBrandJobNo(e.target.value)}
              placeholder="Brand's job number (optional)"
              autoFocus
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowBrandJobPopup(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={confirmPartPending}
                disabled={markingPartPending}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition disabled:opacity-50"
              >
                {markingPartPending ? 'Marking…' : 'Confirm Part Pending'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
