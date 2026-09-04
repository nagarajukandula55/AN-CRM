'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Trash2, Printer, FileText, Check, X, Pencil } from 'lucide-react'
import { validateGSTIN } from '@/lib/validation/gst'
import { StateSelect, CitySelect, PincodeInput } from '@/components/shared/LocationSelect'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from '@/core/catalog/deviceCategory'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingPanel } from '@/components/ui/Spinner'
import { GST_SLABS } from '@/core/gst/gstSlabs'
import { DEFAULT_SPARE_PART_HSN } from '@/core/gst/defaultHsn'
import { openPrintPopup } from '@/lib/openPrintPopup'

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
  hsnCode?: string
  serviceCenterBOMId?: string
  // Display-only basis for the Rate input -- unitPrice is ALWAYS stored
  // tax-EXCLUSIVE (every downstream calc -- lineTotal, the live CGST/SGST
  // preview, and close-time invoice generation via item.unitPrice --
  // assumes that), same convention as BOM.rate and the Add-to-BOM modal's
  // priceIncludesTax. When true, the Rate cell shows/accepts the
  // tax-INCLUSIVE figure and converts to canonical on every change.
  priceIncludesTax?: boolean
}
function displayRate(l: LineItem): number {
  return l.priceIncludesTax ? l.unitPrice * (1 + (l.taxRate || 0) / 100) : l.unitPrice
}
function canonicalRateFromInput(entered: number, l: LineItem): number {
  return l.priceIncludesTax ? entered / (1 + (l.taxRate || 0) / 100) : entered
}
// Default new Parts & Service lines to 18% GST -- per explicit direction,
// the standard rate for the vast majority of parts/labour; still
// per-line editable via the Tax % dropdown for the rare item at a
// different slab.
function emptyLine(): LineItem {
  return { description: '', quantity: 1, unit: 'PCS', unitPrice: 0, taxRate: 18 }
}
function lineTotal(l: LineItem, taxApplyEnabled: boolean): number {
  const base = (l.quantity || 0) * (l.unitPrice || 0)
  return base + (taxApplyEnabled ? base * ((l.taxRate || 0) / 100) : 0)
}

interface BOMPart {
  _id: string; partName: string; partCode: string; unit: string; gstRate: number; rate: number; partType?: string; hsnCode?: string
}
interface Solution { _id: string; code: string; description: string }
interface CrmOption { _id: string; code: string; label: string }

interface JobSheet {
  _id: string; jobSheetNumber: string; customerName: string; phone: string; email?: string
  company?: string; gstin?: string
  address?: string; city?: string; state?: string; pincode?: string
  title: string; product?: string; deviceModel?: string; imeiOrSerialNumber?: string
  brandId?: { name?: string } | string
  deviceModelId?: { name?: string } | string
  status: string; createdAt: string; lineItems: LineItem[]; taxApplyEnabled?: boolean
  remark?: string; ccoName?: string; invoiceNumber?: string; invoiceId?: string; cancelReason?: string
  estimateGenerated?: boolean
  engineerAssignedAt?: string; repairInProgressAt?: string; partPendingAt?: string; repairResumedAt?: string
  completedAt?: string; handedOverAt?: string
  paymentCollected?: number; paymentMode?: string; paymentCollectedByName?: string
  solutionId?: { code?: string; description?: string } | string
  warrantyStatus?: 'IW' | 'OOW' | '90_DAYS' | ''
  startedBySuperAdmin?: boolean
  assignedToName?: string
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

/**
 * basePath/dashboardPath let this same component render inside BOTH the
 * console (/console/sc/jobsheets/*, businessId-scoped) and the vendor
 * portal (/vendor/crm/jobsheets/*) -- previously the vendor portal had a
 * completely separate, drifted 1000+-line reimplementation of this same
 * screen instead of sharing it, reported live ("the one we worked on
 * earlier and designed... was missing something else mapped"). useVendorScope
 * swaps the saved-Brands/Models/Payment-Collectors/labour-charge source
 * from /api/businesses/[id] (rejected for a vendor Owner, see that
 * route's own comment) to /api/vendor/saved-catalog (vendor-scoped).
 */
export default function SCJobSheetScreen({
  basePath = '/console/sc/jobsheets',
  dashboardPath = '/console/sc/dashboard',
  useVendorScope = false,
}: {
  basePath?: string
  dashboardPath?: string
  useVendorScope?: boolean
} = {}) {
  const router = useRouter()
  const params = useParams()
  const idFromRoute = Array.isArray(params?.id) ? params.id[0] : (typeof params?.id === 'string' ? params.id : undefined)
  const { businessId } = useActiveBusinessId()

  const [jobId, setJobId] = useState<string | undefined>(idFromRoute)
  useEffect(() => { setJobId(idFromRoute) }, [idFromRoute])

  const { data: meData } = useSWR('/api/auth/me')
  const currentUserId: string | null = meData?.user?.id ?? null
  const currentUserName: string = meData?.user?.name ?? ''

  // Vendor-type-aware, not business-mode-aware -- a single business (e.g.
  // My Biz Flow) can host BRAND/SC/POS vendors together, so this SC-only
  // single-page flow is gated on the accessing vendor's OWN appliedAs, not
  // Business.operatingMode. Super admins can always reach it (overseeing
  // on a vendor's behalf); a non-SC vendor gets redirected to the regular
  // jobsheets list instead of seeing a screen that isn't theirs.
  const { data: typeContext, isLoading: typeContextLoading } = useSWR('/api/vendor/type-context')
  useEffect(() => {
    if (typeContextLoading || !typeContext) return
    if (typeContext.isSuperAdmin) return
    if (typeContext.appliedAs !== 'SC') {
      router.replace(dashboardPath)
    }
  }, [typeContext, typeContextLoading, router])

  const { data: deviceAppearancesRes } = useSWR(businessId ? `/api/crm-option-lists?listType=DEVICE_APPEARANCE&businessId=${businessId}` : null)
  const deviceAppearances: CrmOption[] = deviceAppearancesRes?.options || []

  // useVendorScope reads/writes the vendor-safe proxy instead of the raw
  // Business document (which now correctly rejects a vendor Owner/Manager
  // -- see api/businesses/[id]/route.ts's own comment) -- normalized into
  // the same `{ business: {...} }` shape so every read below (savedBrands,
  // defaultLabourCharge, etc.) works unchanged regardless of source.
  const catalogEndpoint = useVendorScope ? '/api/vendor/saved-catalog' : (businessId ? `/api/businesses/${businessId}` : null)
  const { data: catalogRaw, mutate: fetchBusiness } = useSWR(catalogEndpoint)
  const businessData = useVendorScope ? (catalogRaw?.success ? { business: catalogRaw } : null) : catalogRaw
  const defaultLabourCharge: number = businessData?.business?.defaultLabourCharge || 0
  const savedBrands: string[] = businessData?.business?.savedBrands || []
  // Keyed by brand name -- a model always belongs to a specific brand now
  // (see Business.savedModelsByBrand's own comment), not the old flat
  // savedModels list with no brand relationship at all.
  const savedModelsByBrand: Record<string, string[]> = businessData?.business?.savedModelsByBrand || {}
  const savedPaymentCollectors: string[] = businessData?.business?.savedPaymentCollectors || []
  // Starter plan: typing a Brand/Model is always allowed (plain text
  // input below), but saving one to the reusable list is Pro+ only --
  // see api/vendor/saved-catalog's own comment. undefined (the
  // console-side /api/businesses/[id] path, which has no such gate) means
  // "allowed", matching that path's existing unrestricted behavior.
  const catalogAllowed: boolean = businessData?.business?.catalogAllowed !== false

  // Persists a new Brand/Payment-Collector name onto the matching
  // Business.saved* array (deduped) so it shows up as a dropdown
  // suggestion on every future workorder -- the mini-modal "add & save"
  // flow asked for, without the shared approval-gated catalog tree (see
  // intake screen's own comment).
  async function saveBusinessListValue(field: 'savedBrands' | 'savedPaymentCollectors', value: string) {
    if (!businessId || !value.trim()) return
    const current: string[] = businessData?.business?.[field] || []
    if (current.some(v => v.toLowerCase() === value.trim().toLowerCase())) return
    const next = [...current, value.trim()]
    await fetch(catalogEndpoint!, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next }),
    })
    fetchBusiness()
  }

  // Model save is a two-part write: the brand itself (if it's new, same
  // dedup as saveBusinessListValue above) AND the model appended under
  // that brand's own list in savedModelsByBrand -- keeps the two always
  // in sync instead of a model ever existing with no real brand behind it.
  async function saveModelForBrand(brand: string, model: string) {
    if (!businessId || !brand.trim() || !model.trim()) return
    const brandName = brand.trim()
    const modelName = model.trim()
    const nextBrands = savedBrands.some(b => b.toLowerCase() === brandName.toLowerCase())
      ? savedBrands
      : [...savedBrands, brandName]
    const currentModels = savedModelsByBrand[brandName] || []
    const nextModelsForBrand = currentModels.some(m => m.toLowerCase() === modelName.toLowerCase())
      ? currentModels
      : [...currentModels, modelName]
    const nextModelsByBrand = { ...savedModelsByBrand, [brandName]: nextModelsForBrand }
    await fetch(catalogEndpoint!, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedBrands: nextBrands, savedModelsByBrand: nextModelsByBrand }),
    })
    fetchBusiness()
  }

  // Resolves the free-text brand/model the intake quick-add uses (fast, no
  // approval gate -- see the comment on savedBrands above) against the
  // REAL Brand/DeviceModel catalog Service Center BOM is organized under
  // (/api/brands, /api/device-models), creating either one if it doesn't
  // exist yet under an exact case-insensitive name match. Reported live:
  // BOM parts filed under a Brand/Model in Service Center BOM never showed
  // up as suggestions on a workorder for that same device, because the
  // job sheet only ever carried pendingBrandName/deviceModel (free text)
  // with brandId/deviceModelId left unset -- the part-picker below has no
  // way to narrow down to "this device's" parts without them. Every SC
  // role already holds the brands/device_models create permission (same
  // one Service Center BOM's own Brand/Model dropdowns use), so this is
  // silent and adds no extra step for the user -- same one "type a brand
  // name" field as before, just now backed by the real catalog instead of
  // a dead-end string.
  async function resolveBrandAndModelIds(brandName: string, modelName: string): Promise<{ brandId?: string; deviceModelId?: string }> {
    if (!businessId || !brandName.trim()) return {}
    try {
      const brandRes = await fetch(`/api/brands?businessId=${businessId}&search=${encodeURIComponent(brandName.trim())}`).then(r => r.json())
      const brandList: { _id: string; name: string }[] = brandRes?.brands || brandRes?.data || []
      let brandId = brandList.find(b => b.name.toLowerCase() === brandName.trim().toLowerCase())?._id
      if (!brandId) {
        const created = await fetch('/api/brands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId, name: brandName.trim() }),
        }).then(r => r.json()).catch(() => null)
        brandId = created?.brand?._id
      }
      if (!brandId || !modelName.trim()) return { brandId }

      const modelRes = await fetch(`/api/device-models?businessId=${businessId}&brandId=${brandId}&search=${encodeURIComponent(modelName.trim())}`).then(r => r.json())
      const modelList: { _id: string; name: string }[] = modelRes?.models || modelRes?.data || []
      let deviceModelId = modelList.find(m => m.name.toLowerCase() === modelName.trim().toLowerCase())?._id
      if (!deviceModelId) {
        const created = await fetch('/api/device-models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId, brandId, name: modelName.trim() }),
        }).then(r => r.json()).catch(() => null)
        deviceModelId = created?.model?._id || created?.deviceModel?._id
      }
      return { brandId, deviceModelId }
    } catch {
      // Best-effort -- a failure here shouldn't block workorder creation
      // over the free-text pendingBrandName/deviceModel fields, which are
      // sent regardless. The workorder just won't have BOM parts narrowed
      // to this device until it's re-saved successfully.
      return {}
    }
  }

  // ---------- Intake (no job yet) ----------
  const [intake, setIntake] = useState({
    customerName: '', phone: '', company: '', gstin: '',
    address: '', city: '', state: '', pincode: '',
    deviceCategory: '' as DeviceCategory | '', brandName: '', deviceModel: '', imeiOrSerialNumber: '',
    deviceAppearance: '' as 'GOOD' | 'USED' | 'DENTS' | 'BROKEN' | '',
    fileBackupDescription: '' as 'YES' | 'NO' | '',
    warrantyStatus: '' as 'IW' | 'OOW' | '90_DAYS' | '',
    title: '', remark: '', ccoName: '',
  })
  // "Logged by" is deliberately NOT auto-filled with the signed-in user's
  // name anymore -- per explicit direction, the person actually taking
  // intake (front-desk staff) often isn't the logged-in account, so
  // defaulting it silently was recording the wrong name. Instead this is a
  // pick-from-recent-names-or-type-a-new-one combobox (datalist), backed
  // by a small per-browser recent-names list in localStorage.
  const LOGGED_BY_STORAGE_KEY = 'an-crm-logged-by-names'
  const [loggedByOptions, setLoggedByOptions] = useState<string[]>([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOGGED_BY_STORAGE_KEY)
      if (raw) setLoggedByOptions(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])
  function rememberLoggedByName(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setLoggedByOptions(prev => {
      const next = [trimmed, ...prev.filter(n => n !== trimmed)].slice(0, 20)
      try { localStorage.setItem(LOGGED_BY_STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // Customer lookup by contact number -- typing a phone number searches
  // existing customers for this business; picking a match autofills the
  // rest of the Customer/Address fields below, which stay fully editable
  // afterward (plain controlled inputs, same as manual entry -- nothing
  // here disables/locks them).
  interface CustomerMatch {
    _id: string; name: string; phone?: string; email?: string; gstin?: string
    address?: string; city?: string; state?: string; pincode?: string
  }
  const [customerMatches, setCustomerMatches] = useState<CustomerMatch[]>([])
  const [showCustomerMatches, setShowCustomerMatches] = useState(false)
  useEffect(() => {
    if (!businessId || intake.phone.trim().length < 3) { setCustomerMatches([]); return }
    const t = setTimeout(() => {
      fetch(`/api/customers?businessId=${businessId}&search=${encodeURIComponent(intake.phone.trim())}`)
        .then(r => r.json())
        .then(d => setCustomerMatches((d?.customers || []).slice(0, 6)))
        .catch(() => setCustomerMatches([]))
    }, 300)
    return () => clearTimeout(t)
  }, [intake.phone, businessId])
  function applyCustomerMatch(c: CustomerMatch) {
    setIntake(p => ({
      ...p,
      phone: c.phone || p.phone,
      customerName: c.name || p.customerName,
      gstin: c.gstin || p.gstin,
      address: c.address || p.address,
      city: c.city || p.city,
      state: c.state || p.state,
      pincode: c.pincode || p.pincode,
    }))
    setShowCustomerMatches(false)
  }
  const modelsForSelectedBrand: string[] = intake.brandName ? (savedModelsByBrand[intake.brandName] || []) : []

  const enabledDeviceCategories: DeviceCategory[] = businessData?.business?.enabledDeviceCategories?.length
    ? businessData.business.enabledDeviceCategories
    : DEVICE_CATEGORIES

  const [creating, setCreating] = useState(false)
  const [intakeError, setIntakeError] = useState<string | null>(null)

  const [addListModal, setAddListModal] = useState<null | 'savedBrands' | 'savedModels'>(null)
  const [addListValue, setAddListValue] = useState('')
  // Only used by the "Add New Model" modal -- lets the user pick an
  // existing brand or type a new one right there, instead of requiring
  // Brand to already be filled in on the intake form first.
  const [addModelBrand, setAddModelBrand] = useState('')
  const [savingListValue, setSavingListValue] = useState(false)

  async function submitAddListValue() {
    if (!addListModal) return
    if (addListModal === 'savedModels') {
      if (!addModelBrand.trim() || !addListValue.trim()) return
      setSavingListValue(true)
      try {
        await saveModelForBrand(addModelBrand.trim(), addListValue.trim())
        setIntake(p => ({ ...p, brandName: addModelBrand.trim(), deviceModel: addListValue.trim() }))
        setAddListModal(null)
        setAddListValue('')
        setAddModelBrand('')
      } finally {
        setSavingListValue(false)
      }
      return
    }
    if (!addListValue.trim()) return
    setSavingListValue(true)
    try {
      await saveBusinessListValue(addListModal, addListValue.trim())
      setIntake(p => ({ ...p, brandName: addListValue.trim() }))
      setAddListModal(null)
      setAddListValue('')
    } finally {
      setSavingListValue(false)
    }
  }

  async function createJobSheet(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) { setIntakeError('Select a business first (top-right business switcher).'); return }
    if (!intake.imeiOrSerialNumber.trim()) { setIntakeError('IMEI / Serial Number is required.'); return }
    if (!intake.address.trim()) { setIntakeError('Address is required.'); return }
    if (!intake.city.trim()) { setIntakeError('City is required.'); return }
    if (!intake.state.trim()) { setIntakeError('State is required.'); return }
    if (!intake.pincode.trim()) { setIntakeError('Pincode is required.'); return }
    if (intake.gstin.trim()) {
      const result = validateGSTIN(intake.gstin)
      if (!result.valid) { setIntakeError(`GSTIN: ${result.reason}`); return }
    }
    setCreating(true)
    setIntakeError(null)
    rememberLoggedByName(intake.ccoName)
    try {
      const { brandId, deviceModelId } = await resolveBrandAndModelIds(intake.brandName, intake.deviceModel)
      const res = await fetch('/api/crm/jobsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: intake.customerName, phone: intake.phone, company: intake.company, gstin: intake.gstin,
          address: intake.address, city: intake.city, state: intake.state, pincode: intake.pincode,
          deviceCategory: intake.deviceCategory, pendingBrandName: intake.brandName, deviceModel: intake.deviceModel,
          brandId, deviceModelId,
          imeiOrSerialNumber: intake.imeiOrSerialNumber, title: intake.title, remark: intake.remark, ccoName: intake.ccoName,
          deviceAppearance: intake.deviceAppearance || undefined, fileBackupDescription: intake.fileBackupDescription || undefined,
          warrantyStatus: intake.warrantyStatus || undefined,
          businessId,
        }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to create job sheet')
      setJobId(d.jobSheet._id)
      router.replace(`${basePath}/${d.jobSheet._id}`)
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
  const [taxApplyEnabled, setTaxApplyEnabled] = useState(true)
  const [remark, setRemark] = useState('')
  const [engineerRemark, setEngineerRemark] = useState('')
  const [solutionId, setSolutionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // The device-detail card below used to show IMEI as read-only text with
  // no way to ever change it -- if it was entered blank/invalid at intake
  // (or the device turned out to need a different one), "Start Repair"
  // then permanently blocks on "Enter a valid 15-digit IMEI" with no way
  // to actually enter one. Reported live. Editable any time the job isn't
  // closed/cancelled yet (not gated behind the stricter `editable` used
  // for parts/line-items, which only opens once repair has ALREADY
  // started -- IMEI specifically needs to be fixable BEFORE that, since
  // it's what blocks starting repair in the first place).
  const [editingImei, setEditingImei] = useState(false)
  const [imeiDraft, setImeiDraft] = useState('')
  const [savingImei, setSavingImei] = useState(false)
  async function saveImei() {
    if (!jobId) return
    setSavingImei(true); setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imeiOrSerialNumber: imeiDraft.trim() }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to save')
      setEditingImei(false)
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setSavingImei(false)
    }
  }

  // OTP-gated edit access for a CLOSED workorder -- see
  // api/crm/jobsheets/[id]/edit-access/{request,verify}. editAccessToken
  // is single-use and only lives in this component's memory (never
  // persisted client-side) -- a page refresh always requires a fresh OTP.
  const [editAccessToken, setEditAccessToken] = useState<string | null>(null)
  const [showOtpModal, setShowOtpModal] = useState(false)
  const [otpValue, setOtpValue] = useState('')
  const [otpStep, setOtpStep] = useState<'requesting' | 'enter' | 'verifying'>('requesting')
  const [otpError, setOtpError] = useState<string | null>(null)

  async function requestEditOtp() {
    setShowOtpModal(true)
    setOtpStep('requesting')
    setOtpError(null)
    setOtpValue('')
    try {
      const res = await fetch(`/api/crm/jobsheets/${jobId}/edit-access/request`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to send OTP')
      setOtpStep('enter')
    } catch (err: any) {
      setOtpError(err.message || 'Something went wrong')
      setOtpStep('enter')
    }
  }

  async function verifyEditOtp() {
    if (!otpValue.trim()) return
    setOtpStep('verifying')
    setOtpError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${jobId}/edit-access/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpValue.trim() }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Incorrect or expired OTP')
      setEditAccessToken(d.editAccessToken)
      setShowOtpModal(false)
    } catch (err: any) {
      setOtpError(err.message || 'Something went wrong')
      setOtpStep('enter')
    }
  }

  useEffect(() => {
    if (job) {
      setLineItems(job.lineItems?.length ? job.lineItems : [])
      setTaxApplyEnabled(job.taxApplyEnabled !== false)
      setRemark(job.remark || '')
      setSolutionId(typeof job.solutionId === 'object' ? '' : (job.solutionId as string) || '')
    }
  }, [job?._id])

  // Narrowed to this job's own brand/model when set (see
  // resolveBrandAndModelIds above) -- GET /api/service-center-bom already
  // supports this filter (brand-agnostic and model-agnostic parts still
  // included inclusively), it just never received these params before, so
  // the picker always showed every active part across every brand mixed
  // together regardless of which device the workorder was actually for.
  const jobBrandId = job ? (typeof job.brandId === 'object' ? undefined : job.brandId) || (job.brandId as any)?._id : undefined
  const jobDeviceModelId = job ? (typeof job.deviceModelId === 'object' ? undefined : job.deviceModelId) || (job.deviceModelId as any)?._id : undefined
  const bomPartsQs = [jobBrandId && `brandId=${jobBrandId}`, jobDeviceModelId && `deviceModelId=${jobDeviceModelId}`].filter(Boolean).join('&')
  const { data: bomPartsData, mutate: fetchBomParts } = useSWR(job ? `/api/service-center-bom${bomPartsQs ? `?${bomPartsQs}` : ''}` : null)
  const bomParts: BOMPart[] = bomPartsData?.success ? (bomPartsData.parts || []) : []

  const [addPartForLine, setAddPartForLine] = useState<number | null>(null)
  // Which line's part-picker dropdown is currently open -- replaces the
  // native <input list>/<datalist> combo, which rendered as an
  // unstyleable, inconsistent browser widget (the "dropdown not proper"
  // complaint) and had no way to hook a selection to auto-fill HSN/Rate/
  // Tax. A real dropdown does both: consistent styling and an onClick that
  // fills the whole line from the picked BOM part.
  const [openPartDropdown, setOpenPartDropdown] = useState<number | null>(null)
  const [newPart, setNewPart] = useState({ partName: '', hsnCode: DEFAULT_SPARE_PART_HSN, rate: '', gstRate: '18', unit: 'PCS', partType: 'SPARE_PART' as BOMPart['partType'], priceIncludesTax: false })
  const [savingPart, setSavingPart] = useState(false)
  const [addPartError, setAddPartError] = useState<string | null>(null)

  async function submitNewPart() {
    if (!newPart.partName.trim() || !newPart.hsnCode.trim() || newPart.rate === '') {
      setAddPartError('Part name, HSN code and rate are required.')
      return
    }
    setSavingPart(true); setAddPartError(null)
    try {
      const res = await fetch('/api/service-center-bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partName: newPart.partName, hsnCode: newPart.hsnCode, rate: Number(newPart.rate),
          gstRate: Number(newPart.gstRate) || 0, unit: newPart.unit, partType: newPart.partType,
          priceIncludesTax: newPart.priceIncludesTax,
        }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.error || 'Failed to add part')
      if (addPartForLine !== null) {
        updateLine(addPartForLine, {
          description: d.part.partName, unitPrice: d.part.rate, taxRate: d.part.gstRate,
          unit: d.part.unit, serviceCenterBOMId: d.part._id,
        })
      }
      fetchBomParts()
      setAddPartForLine(null)
      setNewPart({ partName: '', hsnCode: DEFAULT_SPARE_PART_HSN, rate: '', gstRate: '18', unit: 'PCS', partType: 'SPARE_PART', priceIncludesTax: false })
    } catch (err: any) {
      setAddPartError(err.message || 'Something went wrong')
    } finally {
      setSavingPart(false)
    }
  }

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
    setLineItems((prev) => [...prev, { description: 'Service / Labour Charge', quantity: 1, unit: 'PCS', unitPrice: defaultLabourCharge, taxRate: 18 }])
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
        body: JSON.stringify({
          lineItems, taxApplyEnabled, remark, workPerformed: engineerRemark, solutionId: solutionId || undefined,
          ...(editAccessToken ? { editAccessToken } : {}),
        }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to save')
      // Single-use -- the server already consumed it on this request
      // regardless of outcome, so this component must forget it too
      // rather than let a second Save silently retry with a dead token.
      if (editAccessToken) setEditAccessToken(null)
      fetchJob()
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function claimJobSheet() {
    if (!jobId) return
    setSaving(true); setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${jobId}/claim`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to claim job sheet')
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

  const [showPartPendingModal, setShowPartPendingModal] = useState(false)
  const [brandJobNo, setBrandJobNo] = useState('')

  async function confirmPartPending() {
    await transition('part-pending', { brandJobNoForPartOrder: brandJobNo.trim() || undefined })
    setShowPartPendingModal(false)
  }

  // Cancel used to fire with a hardcoded "Cancelled by service center"
  // reason behind a plain confirm() -- api/crm/jobsheets/[id]/cancel has
  // always required a real cancelReason, this UI just never asked for one.
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReasonInput, setCancelReasonInput] = useState('')

  async function confirmCancel() {
    if (!cancelReasonInput.trim()) return
    await transition('cancel', { cancelReason: cancelReasonInput.trim() })
    setShowCancelModal(false)
    setCancelReasonInput('')
  }

  // GST vs Non-GST is no longer a manual choice at complete-time -- it's
  // derived straight from whether the customer's GSTIN is on file (B2B
  // customer, entered at intake), never a popup interrupting the repair
  // flow. Per explicit direction: "asking GST or Non-GST in a small modal
  // that need ot be reoved based in customer GST no input it should move
  // to the billing model."
  const invoiceType: 'GST' | 'NON_GST' = intake.gstin?.trim() ? 'GST' : 'NON_GST'

  async function completeAndInvoice() {
    if (!jobId) return
    if (!engineerName.trim()) { setActionError('Engineer name is required to complete the repair.'); return }
    setSaving(true); setActionError(null)
    try {
      const saveRes = await fetch(`/api/crm/jobsheets/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems, taxApplyEnabled, remark, workPerformed: engineerRemark, solutionId: solutionId || undefined }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok || saveData.success === false) throw new Error(saveData.message || 'Failed to save line items before closing')
      const res = await fetch(`/api/crm/jobsheets/${jobId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remark, engineerName, invoiceType }),
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

  const [paymentMode, setPaymentMode] = useState('CASH')
  const [paymentCollectedByName, setPaymentCollectedByName] = useState('')
  const [showAddCollectorModal, setShowAddCollectorModal] = useState(false)
  const [newCollectorName, setNewCollectorName] = useState('')
  const [savingCollector, setSavingCollector] = useState(false)

  async function submitNewCollector() {
    if (!newCollectorName.trim()) return
    setSavingCollector(true)
    try {
      await saveBusinessListValue('savedPaymentCollectors', newCollectorName.trim())
      setPaymentCollectedByName(newCollectorName.trim())
      setNewCollectorName('')
      setShowAddCollectorModal(false)
    } finally {
      setSavingCollector(false)
    }
  }

  async function handover() {
    if (!jobId) return
    setSaving(true); setActionError(null)
    try {
      const res = await fetch(`/api/crm/jobsheets/${jobId}/handover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentCollected: nonChargeable ? 0 : total, paymentMode, paymentCollectedByName }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to hand over')
      if (paymentCollectedByName.trim()) saveBusinessListValue('savedPaymentCollectors', paymentCollectedByName)
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
              <Button variant="secondary" size="sm" onClick={() => router.push(basePath)} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
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
                  <div className="relative">
                    <label className={labelCls}>Contact No *</label>
                    <input
                      required
                      type="tel"
                      autoFocus
                      value={intake.phone}
                      onChange={e => { setIntake(p => ({ ...p, phone: e.target.value })); setShowCustomerMatches(true) }}
                      onFocus={() => setShowCustomerMatches(true)}
                      onBlur={() => setTimeout(() => setShowCustomerMatches(false), 150)}
                      className={inputCls}
                      placeholder="Type to look up an existing customer"
                    />
                    {showCustomerMatches && customerMatches.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-control shadow-card-lg max-h-56 overflow-y-auto">
                        {customerMatches.map((c) => (
                          <button
                            key={c._id}
                            type="button"
                            onClick={() => applyCustomerMatch(c)}
                            className="w-full text-left px-3 py-2 hover:bg-surface-2 text-sm"
                          >
                            <span className="font-medium text-ink">{c.name}</span>
                            <span className="text-ink-3 ml-2">{c.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Customer Name *</label>
                    <input required value={intake.customerName} onChange={e => setIntake(p => ({ ...p, customerName: e.target.value }))} className={inputCls} placeholder="Fills in automatically if the number matches, or type it in" />
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
                  <label className={labelCls}>Address *</label>
                  <input required value={intake.address} onChange={e => setIntake(p => ({ ...p, address: e.target.value }))} className={inputCls} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={labelCls}>Pincode *</label>
                    <PincodeInput
                      value={intake.pincode}
                      onChange={(value) => setIntake(p => ({ ...p, pincode: value }))}
                      onResolved={({ state, city }) => setIntake(p => ({ ...p, state: p.state || state, city: p.city || city }))}
                      placeholder="400001"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>State *</label>
                    <StateSelect value={intake.state} onChange={(value) => setIntake(p => ({ ...p, state: value, city: '' }))} className={`${inputCls} appearance-none`} />
                  </div>
                  <div>
                    <label className={labelCls}>City *</label>
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
                    <div className="flex gap-1">
                      <input list="sc-brand-list" value={intake.brandName} onChange={e => setIntake(p => ({ ...p, brandName: e.target.value, deviceModel: e.target.value === p.brandName ? p.deviceModel : '' }))} className={inputCls} placeholder="e.g. Samsung" />
                      <datalist id="sc-brand-list">
                        {savedBrands.map(b => <option key={b} value={b} />)}
                      </datalist>
                      {catalogAllowed && (
                        <button type="button" title="Add new brand" onClick={() => { setAddListModal('savedBrands'); setAddListValue('') }} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-control border border-border text-ink-3 hover:text-accent hover:border-accent">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Model</label>
                    <div className="flex gap-1">
                      <input list="sc-model-list" value={intake.deviceModel} onChange={e => setIntake(p => ({ ...p, deviceModel: e.target.value }))} className={inputCls} placeholder={intake.brandName ? 'e.g. Galaxy M14' : 'Pick a brand first'} />
                      <datalist id="sc-model-list">
                        {modelsForSelectedBrand.map(m => <option key={m} value={m} />)}
                      </datalist>
                      {catalogAllowed && (
                        <button type="button" title="Add new model" onClick={() => { setAddListModal('savedModels'); setAddListValue(''); setAddModelBrand(intake.brandName || '') }} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-control border border-border text-ink-3 hover:text-accent hover:border-accent">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>IMEI / Serial Number *</label>
                  <input required value={intake.imeiOrSerialNumber} onChange={e => setIntake(p => ({ ...p, imeiOrSerialNumber: e.target.value }))} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Appearance</label>
                    <select value={intake.deviceAppearance} onChange={e => setIntake(p => ({ ...p, deviceAppearance: e.target.value as typeof intake.deviceAppearance }))} className={inputCls}>
                      <option value="">Select…</option>
                      {deviceAppearances.map(o => <option key={o._id} value={o.code}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>File Backup Done</label>
                    <select value={intake.fileBackupDescription} onChange={e => setIntake(p => ({ ...p, fileBackupDescription: e.target.value as typeof intake.fileBackupDescription }))} className={inputCls}>
                      <option value="">Select…</option>
                      <option value="YES">Yes</option>
                      <option value="NO">No</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Warranty Type</label>
                    <select value={intake.warrantyStatus} onChange={e => setIntake(p => ({ ...p, warrantyStatus: e.target.value as typeof intake.warrantyStatus }))} className={inputCls}>
                      <option value="">Select…</option>
                      <option value="IW">In Warranty (IW)</option>
                      <option value="OOW">Out of Warranty (OOW)</option>
                      <option value="90_DAYS">90 Days Warranty</option>
                    </select>
                  </div>
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
                    <label className={labelCls}>Logged By (CCO Name) *</label>
                    <input
                      required
                      list="cco-name-options"
                      placeholder="Select recent name or type a new one"
                      value={intake.ccoName}
                      onChange={e => setIntake(p => ({ ...p, ccoName: e.target.value }))}
                      className={inputCls}
                    />
                    <datalist id="cco-name-options">
                      {loggedByOptions.map(name => <option key={name} value={name} />)}
                    </datalist>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </form>

        {addListModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setAddListModal(null)}>
            <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">{addListModal === 'savedBrands' ? 'Add New Brand' : 'Add New Model'}</h3>
                <button onClick={() => setAddListModal(null)} className="text-ink-3 hover:text-ink"><X className="w-4 h-4" /></button>
              </div>
              {addListModal === 'savedModels' && (
                <div>
                  <label className={labelCls}>Brand</label>
                  <input list="sc-brand-list" autoFocus value={addModelBrand} onChange={e => setAddModelBrand(e.target.value)} className={inputCls} placeholder="Pick existing or type a new one" />
                </div>
              )}
              <div>
                <label className={labelCls}>{addListModal === 'savedBrands' ? 'Brand Name' : 'Model Name'}</label>
                <input autoFocus={addListModal === 'savedBrands'} value={addListValue} onChange={e => setAddListValue(e.target.value)} className={inputCls} placeholder={addListModal === 'savedBrands' ? 'e.g. Samsung' : 'e.g. Galaxy M14'} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={() => setAddListModal(null)}>Cancel</Button>
                <Button size="sm" onClick={submitAddListValue} disabled={savingListValue || !addListValue.trim() || (addListModal === 'savedModels' && !addModelBrand.trim())} icon={savingListValue ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>Save &amp; Use</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---------- Loading the job ----------
  if (loading || !job) {
    return <LoadingPanel label="Loading workorder…" />
  }

  const total = lineItems.reduce((sum, l) => sum + lineTotal(l, taxApplyEnabled), 0)
  // Live CGST/SGST/IGST preview -- mirrors the same split computed for
  // real at close time (api/crm/jobsheets/[id]/close/route.ts), but that
  // route's supplyType (INTRASTATE/INTERSTATE) is only chosen in the close
  // modal, not known yet on this live form -- defaults to INTRASTATE (the
  // same default the close route itself uses) since it's the common case;
  // the close modal is still where the real, authoritative choice happens.
  const taxSubtotal = lineItems.reduce((sum, l) => sum + (l.quantity || 0) * (l.unitPrice || 0), 0)
  const taxAmountTotal = total - taxSubtotal
  const cgstAmount = taxApplyEnabled ? taxAmountTotal / 2 : 0
  const sgstAmount = cgstAmount
  // IW/90-day-warranty jobs are non-chargeable -- no Estimate/Invoice may
  // ever be generated and the payable amount is forced to 0 server-side
  // (see close/handover routes' isNonChargeableWarranty check). OOW keeps
  // the normal chargeable flow unchanged.
  const nonChargeable = job.warrantyStatus === 'IW' || job.warrantyStatus === '90_DAYS'
  const isOpen = job.status !== 'CLOSED' && job.status !== 'CANCELLED'
  const inRepair = job.status === 'REPAIR_STARTED' || job.status === 'REPAIR_IN_PROGRESS'
  // Parts/lines are only editable while repair is actually underway --
  // once REPAIR_COMPLETED, the job is done and only Handover & Close
  // remains; letting the line items still be edited at that point (as
  // they were before) let someone silently change what was actually
  // repaired/charged after the fact.
  const editable = inRepair || job.status === 'PART_PENDING' || (job.status === 'CLOSED' && !!editAccessToken)
  const tat = tatLabel(job.createdAt, job.completedAt)

  // ---------- In-progress / closure screen (same route, same component) ----------
  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title={job.jobSheetNumber}
        description={`${job.customerName} — ${[job.product, job.deviceModel].filter(Boolean).join(' · ') || 'Device'}`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => router.push(basePath)} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
            <Button variant="secondary" size="sm" onClick={() => openPrintPopup(`/print/jobsheets/${job._id}`)} icon={<Printer className="w-4 h-4" />}>Print Workorder</Button>
            {inRepair && !nonChargeable && (job.estimateGenerated ? (
              <Button variant="secondary" size="sm" onClick={() => openPrintPopup(`/print/jobsheets/${job._id}?doc=estimate`)} icon={<FileText className="w-4 h-4" />}>Print Estimate</Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={(job.lineItems?.length ?? 0) === 0}
                onClick={async () => {
                  if ((job.lineItems?.length ?? 0) === 0) {
                    alert('Add Parts & Service Lines to this workorder before raising an estimate.')
                    return
                  }
                  const res = await fetch(`/api/crm/jobsheets/${job._id}/generate-estimate`, { method: 'POST' })
                  const body = await res.json().catch(() => ({}))
                  if (!res.ok || !body?.success) {
                    alert(body?.message || 'Failed to generate estimate')
                    return
                  }
                  await fetchJob()
                  openPrintPopup(`/print/jobsheets/${job._id}?doc=estimate`)
                }}
                icon={<FileText className="w-4 h-4" />}
              >
                Generate Estimate
              </Button>
            ))}
            {(job.status === 'REPAIR_COMPLETED' || job.status === 'CLOSED') && (
              <>
                <Button variant="secondary" size="sm" onClick={() => openPrintPopup(`/print/jobsheets/${job._id}/service-record`)} icon={<FileText className="w-4 h-4" />}>Service Order</Button>
                {job.invoiceNumber && (
                  <Button variant="secondary" size="sm" onClick={() => openPrintPopup(`/invoice/${job.invoiceNumber}`)} icon={<FileText className="w-4 h-4" />}>Invoice</Button>
                )}
              </>
            )}
            {/* Every primary action lives up here now, not a separate
                bottom action bar -- per explicit direction. Editing
                (Save/parts) only makes sense while repair is actually in
                progress -- see the `editable` gate on Parts & Service
                Lines below, which excludes CREATED (not started yet) and
                REPAIR_COMPLETED (already done, only Handover remains). */}
            {editable && (
              <Button variant="secondary" size="sm" onClick={saveLineItems} disabled={saving}>Save</Button>
            )}
            {job.status === 'PART_PENDING' && (
              <Button size="sm" onClick={() => transition('resume-repair')} disabled={saving}>Resume Repair</Button>
            )}
            {inRepair && (
              <Button variant="secondary" size="sm" onClick={() => { setBrandJobNo(''); setShowPartPendingModal(true) }} disabled={saving}>Mark Part Pending</Button>
            )}
            {inRepair && (
              <Button size="sm" onClick={completeAndInvoice} disabled={saving} icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
                {nonChargeable ? 'Complete Repair (No Charge)' : 'Complete Repair & Invoice'}
              </Button>
            )}
            {job.status === 'CREATED' && (
              <Button size="sm" onClick={proceedForRepair} disabled={saving}>Proceed for Repair</Button>
            )}
            {isOpen && (
              <Button variant="secondary" size="sm" onClick={() => { setCancelReasonInput(''); setShowCancelModal(true) }} disabled={saving} className="text-danger">
                Cancel Job Sheet
              </Button>
            )}
          </>
        }
      />

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <MilestoneStepper job={job} />
        <div className="flex items-center gap-2">
          {job.warrantyStatus && (
            <Badge tone={nonChargeable ? 'info' : 'neutral'}>
              {job.warrantyStatus === '90_DAYS' ? '90 Days Warranty' : job.warrantyStatus === 'IW' ? 'In Warranty (IW)' : 'Out of Warranty (OOW)'}
              {nonChargeable && ' · No Charge'}
            </Badge>
          )}
          {tat && (
            <Badge tone={job.completedAt ? 'success' : 'warning'}>
              TAT: {tat}{!job.completedAt && ' (running)'}
            </Badge>
          )}
        </div>
      </div>

      {actionError && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{actionError}</div>}
      {job.status === 'CANCELLED' && job.cancelReason && (
        <div className="mb-6 text-sm text-ink-2 bg-surface-2 border border-border rounded-control px-4 py-3">Cancelled: {job.cancelReason}</div>
      )}
      {job.startedBySuperAdmin && !typeContext?.isSuperAdmin && (
        <div className="mb-6 flex items-center justify-between gap-3 text-sm text-ink-2 bg-accent-soft border border-accent/20 rounded-control px-4 py-3">
          <span>This repair was started by a Super Admin{job.assignedToName ? ` (${job.assignedToName})` : ''}. Claim it to continue the repair yourself.</span>
          <Button size="sm" onClick={claimJobSheet} disabled={saving}>Claim &amp; Continue</Button>
        </div>
      )}

      <Card className="p-5 mb-6">
        <h3 className="text-sm font-semibold text-ink mb-2">Customer &amp; Device</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
          <div><span className="text-ink-3 text-xs">Customer</span><p className="text-ink">{job.customerName}</p></div>
          <div><span className="text-ink-3 text-xs">Phone</span><p className="text-ink">{job.phone}</p></div>
          <div><span className="text-ink-3 text-xs">Device</span><p className="text-ink">{[job.product, typeof job.brandId === 'object' ? job.brandId?.name : undefined, job.deviceModel].filter(Boolean).join(' · ') || '—'}</p></div>
          <div>
            <span className="text-ink-3 text-xs">IMEI/Serial</span>
            {editingImei ? (
              <div className="flex items-center gap-1 mt-0.5">
                <input
                  autoFocus
                  value={imeiDraft}
                  onChange={(e) => setImeiDraft(e.target.value)}
                  className={inputCls}
                  placeholder="15-digit IMEI or serial number"
                />
                <button type="button" onClick={saveImei} disabled={savingImei} className="p-1 text-success hover:bg-success-soft rounded-control disabled:opacity-50">
                  {savingImei ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button type="button" onClick={() => setEditingImei(false)} disabled={savingImei} className="p-1 text-ink-3 hover:bg-surface-2 rounded-control">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-ink flex items-center gap-1.5">
                {job.imeiOrSerialNumber || '—'}
                {isOpen && (
                  <button
                    type="button"
                    onClick={() => { setImeiDraft(job.imeiOrSerialNumber || ''); setEditingImei(true) }}
                    className="text-ink-3 hover:text-accent"
                    title="Edit IMEI / Serial Number"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="pt-3 border-t border-border">
          <span className="text-ink-3 text-xs">Fault Reported</span>
          <p className="text-sm text-ink-2">{job.title}</p>
        </div>
        {job.ccoName && <p className="text-xs text-ink-3 mt-2">Logged by (CCO): {job.ccoName}</p>}
      </Card>

      {/* Was `isOpen && ...` -- isOpen excludes CLOSED entirely, so this
          whole card (line items, tax, totals) vanished the moment a
          workorder closed instead of staying visible read-only. `editable`
          already correctly gates actual editing (including the CLOSED +
          OTP-unlocked case), so visibility just needs to also include
          CLOSED. Regression reported live: "once closed only fewer
          details are being shown now". */}
      {job.status !== 'CREATED' && job.status !== 'CANCELLED' && (
        <Card className="overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-ink">Parts &amp; Service Lines</h3>
            {editable && (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs text-ink-2">
                  <input type="checkbox" checked={taxApplyEnabled} onChange={e => setTaxApplyEnabled(e.target.checked)} />
                  Tax Apply
                </label>
                <Button variant="secondary" size="sm" onClick={addLabourCharge} icon={<Plus className="w-4 h-4" />}>Add Service/Labour Charge</Button>
                <Button variant="secondary" size="sm" onClick={addLine} icon={<Plus className="w-4 h-4" />}>Add Line</Button>
                <Button
                  variant="secondary" size="sm"
                  onClick={() => { setAddPartForLine(lineItems.length); addLine(); setAddPartError(null) }}
                  icon={<Plus className="w-4 h-4" />}
                >
                  Add New Part to BOM
                </Button>
              </div>
            )}
          </div>
          {!editable && (
            <p className="px-5 py-2 text-xs text-ink-3 bg-surface-2/40 border-b border-border">
              {job.status === 'CREATED' ? 'Editable once you click Proceed for Repair.' : 'This job is past the repair stage and can no longer be edited.'}
            </p>
          )}
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
                  <th className="text-right px-2 py-2 text-xs text-ink-3 font-medium w-28">Rate</th>
                  <th className="text-right px-2 py-2 text-xs text-ink-3 font-medium w-20">Tax %</th>
                  <th className="text-right px-5 py-2 text-xs text-ink-3 font-medium w-24">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lineItems.map((l, i) => (
                  <tr key={i}>
                    <td className="px-5 py-1.5 relative">
                      <input
                        disabled={!editable}
                        value={l.description}
                        onChange={e => { updateLine(i, { description: e.target.value }); setOpenPartDropdown(i) }}
                        onFocus={() => setOpenPartDropdown(i)}
                        onBlur={() => setTimeout(() => setOpenPartDropdown(cur => (cur === i ? null : cur)), 150)}
                        className={`${inputCls} py-1.5 disabled:opacity-60 disabled:cursor-not-allowed`}
                        placeholder="Part / service name"
                        autoComplete="off"
                      />
                      {editable && openPartDropdown === i && (() => {
                        const query = l.description.trim().toLowerCase()
                        const matches = (query ? bomParts.filter(p => p.partName.toLowerCase().includes(query)) : bomParts).slice(0, 20)
                        if (matches.length === 0) return null
                        return (
                          <div className="absolute z-20 mt-1 left-5 right-2 rounded-control border border-border bg-surface shadow-card-lg max-h-56 overflow-y-auto">
                            {matches.map(p => (
                              <button
                                type="button"
                                key={p._id}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                  updateLine(i, {
                                    description: p.partName,
                                    hsnCode: p.hsnCode || '',
                                    unitPrice: p.rate,
                                    taxRate: p.gstRate,
                                    unit: p.unit || 'PCS',
                                    serviceCenterBOMId: p._id,
                                  })
                                  setOpenPartDropdown(null)
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-surface-2 text-sm flex items-center justify-between gap-2"
                              >
                                <span className="text-ink truncate">{p.partName}</span>
                                <span className="text-xs text-ink-3 tabular shrink-0">₹{p.rate} · {p.gstRate}%</span>
                              </button>
                            ))}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-2 py-1.5"><input disabled={!editable} type="number" onFocus={e => e.target.select()} min={1} value={l.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) })} className={`${inputCls} py-1.5 text-center disabled:opacity-60 disabled:cursor-not-allowed`} /></td>
                    <td className="px-2 py-1.5">
                      <input
                        disabled={!editable}
                        type="number"
                        onFocus={e => e.target.select()}
                        min={0}
                        value={displayRate(l)}
                        onChange={e => updateLine(i, { unitPrice: canonicalRateFromInput(Number(e.target.value), l) })}
                        className={`${inputCls} py-1 text-right disabled:opacity-60 disabled:cursor-not-allowed`}
                      />
                      {/* Same GST-inclusive/exclusive basis toggle as the
                          Material Catalog / Add-to-BOM modal, applied
                          per-line here -- unitPrice always stays canonical
                          (tax-exclusive) underneath, see displayRate/
                          canonicalRateFromInput above. */}
                      <select
                        disabled={!editable}
                        value={l.priceIncludesTax ? 'INCLUSIVE' : 'EXCLUSIVE'}
                        // The underlying canonical (exclusive) unitPrice
                        // never changes here -- toggling only changes how
                        // it's DISPLAYED/entered going forward (via
                        // displayRate), never the actual price.
                        onChange={e => updateLine(i, { priceIncludesTax: e.target.value === 'INCLUSIVE' })}
                        className="mt-0.5 w-full text-[10px] text-ink-3 bg-transparent border-0 p-0 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="EXCLUSIVE">Excl. GST</option>
                        <option value="INCLUSIVE">Incl. GST</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select disabled={!editable || !taxApplyEnabled} value={l.taxRate} onChange={e => updateLine(i, { taxRate: Number(e.target.value) })} className={`${inputCls} py-1.5 text-right disabled:opacity-60 disabled:cursor-not-allowed`}>
                        {GST_SLABS.map(rate => <option key={rate} value={rate}>{rate}%</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-1.5 text-right tabular text-ink font-medium text-xs">₹{lineTotal(l, taxApplyEnabled).toFixed(2)}</td>
                    <td className="px-2 py-1.5">{editable && <button onClick={() => removeLine(i)} className="text-ink-3 hover:text-danger"><Trash2 className="w-4 h-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-5 py-3 border-t border-border bg-surface-2/40 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-3">Subtotal</span>
              <span className="text-xs text-ink-2 tabular">₹{taxSubtotal.toFixed(2)}</span>
            </div>
            {taxApplyEnabled && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-3">CGST</span>
                  <span className="text-xs text-ink-2 tabular">₹{cgstAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-3">SGST</span>
                  <span className="text-xs text-ink-2 tabular">₹{sgstAmount.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <span className="text-sm text-ink-2">
                {nonChargeable ? 'Payable' : 'Total'} {!nonChargeable && !taxApplyEnabled && <span className="text-ink-3">(tax not applied)</span>}
              </span>
              <span className="text-sm font-semibold text-ink tabular">₹{nonChargeable ? '0.00' : total.toFixed(2)}</span>
            </div>
            {nonChargeable && (
              <p className="text-[11px] text-ink-3">Costs above are for internal tracking only -- this job is non-chargeable ({job.warrantyStatus === '90_DAYS' ? '90 Days Warranty' : 'In Warranty'}), no invoice/estimate will be generated.</p>
            )}
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

      {job.status === 'REPAIR_COMPLETED' && (
        <Card className="p-5 mt-6">
          <h3 className="text-sm font-semibold text-ink mb-3">Handover &amp; Close</h3>
          {/* No separate "Payment Collected" amount field -- the Total
              row in Parts & Service Lines just above is the same number
              (both come from this same lineItems/total), so re-entering
              it here was asking for the same figure twice. */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelCls}>Payment Mode</label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className={inputCls}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Payment Collected By</label>
              <div className="flex gap-1.5">
                <select value={paymentCollectedByName} onChange={e => setPaymentCollectedByName(e.target.value)} className={inputCls}>
                  <option value="">Select…</option>
                  {savedPaymentCollectors.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => { setNewCollectorName(''); setShowAddCollectorModal(true) }}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-control border border-border hover:bg-surface-2 text-ink-2"
                  title="Add new name"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <Button size="lg" className="w-full" onClick={handover} disabled={saving || !paymentCollectedByName.trim()} icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>Hand Over to Customer &amp; Close</Button>
        </Card>
      )}

      {showAddCollectorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowAddCollectorModal(false)}>
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Add New Collector Name</h3>
              <button onClick={() => setShowAddCollectorModal(false)} className="text-ink-3 hover:text-ink"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className={labelCls}>Name of person who collects payments</label>
              <input autoFocus value={newCollectorName} onChange={e => setNewCollectorName(e.target.value)} className={inputCls} placeholder="e.g. Nagaraj" onKeyDown={e => e.key === 'Enter' && submitNewCollector()} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setShowAddCollectorModal(false)}>Cancel</Button>
              <Button size="sm" onClick={submitNewCollector} disabled={savingCollector || !newCollectorName.trim()} icon={savingCollector ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>Save &amp; Use</Button>
            </div>
          </div>
        </div>
      )}

      {job.status === 'CLOSED' && (
        <Card className="p-5 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">Handover Summary</h3>
            {editAccessToken ? (
              <Badge tone="warning">Edit unlocked — Parts &amp; Service Lines above is now editable</Badge>
            ) : (
              <Button variant="secondary" size="sm" onClick={requestEditOtp} disabled={saving}>
                Request Edit Access
              </Button>
            )}
          </div>
          {/* Was just "This job sheet is closed." with no detail at all --
              reported live: the handover/payment info entered when this
              job was closed had nowhere to be verified afterward. Parts &
              Service Lines and the milestone stepper above already stay
              visible (read-only) once closed; this fills in the one piece
              that was missing. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-ink-3 text-xs">Payment Collected</span>
              <p className="text-ink tabular">{job.paymentCollected != null ? `₹${job.paymentCollected}` : '—'}</p>
            </div>
            <div>
              <span className="text-ink-3 text-xs">Payment Mode</span>
              <p className="text-ink">{job.paymentMode || '—'}</p>
            </div>
            <div>
              <span className="text-ink-3 text-xs">Payment Collected By</span>
              <p className="text-ink">{job.paymentCollectedByName || '—'}</p>
            </div>
            <div>
              <span className="text-ink-3 text-xs">Handed Over At</span>
              <p className="text-ink">{fmtDateTime(job.handedOverAt) || '—'}</p>
            </div>
          </div>
          {!editAccessToken && (
            <p className="text-xs text-ink-3 mt-3">
              Editing a closed workorder's Parts &amp; Service Lines requires an OTP sent to this business's personal Telegram chat.
              Note: this corrects the workorder's own record only — it does not regenerate the already-issued invoice.
            </p>
          )}
        </Card>
      )}

      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => otpStep !== 'requesting' && setShowOtpModal(false)}>
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Edit Access — OTP Required</h3>
              <button onClick={() => setShowOtpModal(false)} className="text-ink-3 hover:text-ink"><X className="w-4 h-4" /></button>
            </div>
            {otpStep === 'requesting' ? (
              <div className="flex items-center gap-2 text-sm text-ink-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Sending OTP to the personal Telegram chat…
              </div>
            ) : (
              <>
                <p className="text-xs text-ink-3">
                  Enter the 6-digit code sent to this business's <b>personal</b> Telegram chat (not the group). Valid for 10 minutes.
                </p>
                {otpError && <div className="text-xs text-danger bg-danger-soft border border-danger/20 rounded-control px-3 py-2">{otpError}</div>}
                <input
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  value={otpValue}
                  onChange={e => setOtpValue(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && verifyEditOtp()}
                  className={`${inputCls} text-center tracking-[0.5em] text-lg font-mono`}
                  placeholder="••••••"
                />
                <div className="flex justify-between items-center pt-1">
                  <button type="button" onClick={requestEditOtp} className="text-xs text-accent hover:underline">Resend code</button>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setShowOtpModal(false)}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={verifyEditOtp}
                      disabled={otpStep === 'verifying' || otpValue.trim().length !== 6}
                      icon={otpStep === 'verifying' ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                    >
                      Verify
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showPartPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowPartPendingModal(false)}>
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Mark Part Pending</h3>
              <button onClick={() => setShowPartPendingModal(false)} className="text-ink-3 hover:text-ink"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className={labelCls}>Brand Job No. <span className="text-ink-3 font-normal">(optional)</span></label>
              <input autoFocus value={brandJobNo} onChange={e => setBrandJobNo(e.target.value)} className={inputCls} placeholder="e.g. brand's part-order reference" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setShowPartPendingModal(false)}>Cancel</Button>
              <Button size="sm" onClick={confirmPartPending} disabled={saving} icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>Confirm</Button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowCancelModal(false)}>
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Cancel Job Sheet</h3>
              <button onClick={() => setShowCancelModal(false)} className="text-ink-3 hover:text-ink"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className={labelCls}>Reason for cancellation *</label>
              <textarea autoFocus rows={3} value={cancelReasonInput} onChange={e => setCancelReasonInput(e.target.value)} className={inputCls} placeholder="Why is this job sheet being cancelled?" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setShowCancelModal(false)}>Back</Button>
              <Button variant="danger" size="sm" onClick={confirmCancel} disabled={saving || !cancelReasonInput.trim()} icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>Confirm Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {addPartForLine !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setAddPartForLine(null)}>
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Add New Part to BOM</h3>
              <button onClick={() => setAddPartForLine(null)} className="text-ink-3 hover:text-ink"><X className="w-4 h-4" /></button>
            </div>
            {addPartError && <div className="text-xs text-danger bg-danger-soft border border-danger/20 rounded-control px-3 py-2">{addPartError}</div>}
            <div>
              <label className={labelCls}>Part / Material Name *</label>
              <input value={newPart.partName} onChange={e => setNewPart(p => ({ ...p, partName: e.target.value }))} className={inputCls} placeholder="e.g. iPhone 13 Display Assembly" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>HSN Code *</label>
                <input value={newPart.hsnCode} onChange={e => setNewPart(p => ({ ...p, hsnCode: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Unit</label>
                <input value={newPart.unit} onChange={e => setNewPart(p => ({ ...p, unit: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls}>Rate *</label>
                <input type="number" onFocus={e => e.target.select()} min={0} value={newPart.rate} onChange={e => setNewPart(p => ({ ...p, rate: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tax %</label>
                <select value={newPart.gstRate} onChange={e => setNewPart(p => ({ ...p, gstRate: e.target.value }))} className={inputCls}>
                  {GST_SLABS.map(rate => <option key={rate} value={rate}>{rate}%</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <select value={newPart.partType} onChange={e => setNewPart(p => ({ ...p, partType: e.target.value as BOMPart['partType'] }))} className={inputCls}>
                  <option value="SPARE_PART">Spare Part</option>
                  <option value="CONSUMABLE">Consumable</option>
                  <option value="LABOUR">Labour</option>
                </select>
              </div>
            </div>
            <div>
              {/* Same "This rate is" GST-inclusive/exclusive basis toggle as
                  the Material Catalogue (console/common/material-catalog) --
                  /api/service-center-bom's POST already backs a tax-inclusive
                  entered rate out into the canonical tax-exclusive BOM.rate
                  when priceIncludesTax is true, same as that page's flow. */}
              <label className={labelCls}>This rate is</label>
              <select
                value={newPart.priceIncludesTax ? 'INCLUSIVE' : 'EXCLUSIVE'}
                onChange={e => setNewPart(p => ({ ...p, priceIncludesTax: e.target.value === 'INCLUSIVE' }))}
                className={inputCls}
              >
                <option value="EXCLUSIVE">Without tax</option>
                <option value="INCLUSIVE">With tax (inclusive)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setAddPartForLine(null)}>Cancel</Button>
              <Button size="sm" onClick={submitNewPart} disabled={savingPart} icon={savingPart ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>Save to BOM</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
