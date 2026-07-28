'use client'

import { useState, useEffect, Fragment } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  Plus, X, Building2, CheckCircle,
  Clock, Star, ChevronRight, ChevronLeft, ChevronDown, Truck, Users, Network,
} from 'lucide-react'
import { StateSelect, CitySelect, PincodeInput } from '@/components/shared/LocationSelect'
import { validateGSTINAgainstState } from '@/lib/validation/gst'
import { VendorDetailModal, VendorDetailData } from '@/components/shared/VendorDetailModal'
import { getComplianceDocsForIndustry, getVendorDocRequirements, type ComplianceDocRequirement } from '@/core/vendorCompliance'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Field, Input, Select as SelectControl, Textarea } from '@/components/ui/Input'

type Vendor = VendorDetailData

interface BusinessOption { _id: string; name: string; brandName?: string; industry?: string }

const CATEGORIES = [
  'Raw Materials','Packaging','Electronics','Machinery','Services',
  'Logistics','IT & Software','Office Supplies','Utilities','Other',
]

const PAYMENT_TERMS = [
  'Immediate','Net 7','Net 15','Net 30','Net 45','Net 60','Net 90',
]

const STATUS_TONE: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  APPROVED: 'success',
  PENDING:  'warning',
  ACTIVE:   'info',
  INACTIVE: 'neutral',
  REJECTED: 'danger',
}

// Vendor type -- Brand (multi-role call center + appointments), SC
// (single-login work-order shop), POS (billing counter) -- the same three
// operating modes as pricing/plans.ts, set on VendorProfile.appliedAs.
// Never shown on this page before, even though every vendor already has
// this field: the page had no Type column and no hierarchy display at all.
const TYPE_TONE: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  BRAND: 'info',
  SC: 'warning',
  POS: 'neutral',
}
const TYPE_LABEL: Record<string, string> = { BRAND: 'Brand', SC: 'Service Center', POS: 'POS' }

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <Star key={s} className={`w-3 h-3 ${s <= rating ? 'text-warning fill-warning' : 'text-ink-3'}`} />
      ))}
    </div>
  )
}

const TABS = ['Basic Info', 'Address', 'Bank Details', 'Compliance', 'Additional'] as const
type Tab = typeof TABS[number]

interface SubVendorRow {
  _id: string; vendorId?: string; companyName: string; contactPerson?: string
  email?: string; phone?: string; isApproved?: boolean; createdAt: string
}

/** Expandable sub-vendor tree under a parent vendor row -- fetched lazily
 * (only once a row is expanded) from the already-existing
 * /api/vendors/[id]/sub-vendors endpoint, which until now had no UI
 * anywhere in the app. */
function SubVendorRows({ parentId, onOpen }: { parentId: string; onOpen: (id: string) => void }) {
  const { data, isLoading } = useSWR(`/api/vendors/${parentId}/sub-vendors`, { revalidateOnFocus: false })
  const subVendors: SubVendorRow[] = data?.success ? (data.subVendors || []) : []

  if (isLoading) {
    return (
      <tr>
        <td colSpan={9} className="px-6 py-3 pl-14 text-xs text-ink-3">Loading sub-vendors…</td>
      </tr>
    )
  }
  if (subVendors.length === 0) {
    return (
      <tr>
        <td colSpan={9} className="px-6 py-3 pl-14 text-xs text-ink-3">No sub-vendors under this vendor yet.</td>
      </tr>
    )
  }
  return (
    <>
      {subVendors.map((sv) => (
        <tr key={sv._id} onClick={() => onOpen(sv._id)} className="bg-surface-2 hover:bg-surface-3 transition cursor-pointer">
          <td className="px-6 py-2.5 pl-14">
            <div className="flex items-center gap-2">
              <span className="text-ink-3">└</span>
              <div>
                <p className="text-sm font-medium text-ink">{sv.companyName}</p>
                <p className="text-xs text-ink-3">{sv.vendorId}</p>
              </div>
            </div>
          </td>
          <td className="px-6 py-2.5 text-sm text-ink-2">{sv.contactPerson ?? '—'}</td>
          <td className="px-6 py-2.5 text-sm text-ink-3" colSpan={2}>{sv.email || sv.phone || '—'}</td>
          <td className="px-6 py-2.5" colSpan={3} />
          <td className="px-6 py-2.5 text-center">
            <Badge tone={sv.isApproved ? 'success' : 'warning'}>{sv.isApproved ? 'Active' : 'Pending'}</Badge>
          </td>
          <td className="px-6 py-2.5" />
        </tr>
      ))}
    </>
  )
}

/** One compliance-document upload card -- the Compliance tab previously
 * repeated this block three times (required catalog docs, industry docs,
 * optional docs) with identical markup, all in the old hand-rolled
 * gray-200/emerald-300 styling. */
function ComplianceDocCard({ doc, uploaded, optional, onNumberChange, onUpload }: {
  doc: ComplianceDocRequirement
  uploaded?: { url?: string; number?: string; uploading?: boolean }
  optional?: boolean
  onNumberChange: (value: string) => void
  onUpload: (file: File) => void
}) {
  return (
    <div className="rounded-control border border-border p-4">
      <p className="text-sm font-medium text-ink">{doc.label}{!optional && <span className="text-danger ml-0.5">*</span>}</p>
      {doc.helpText && <p className="text-[11px] text-ink-3 mt-0.5 mb-2">{doc.helpText}</p>}

      {doc.collectNumber && (
        <Input
          type="text"
          placeholder={doc.numberLabel || 'License number'}
          value={uploaded?.number || ''}
          onChange={e => onNumberChange(e.target.value)}
          className="mb-2 py-2"
        />
      )}

      <label className={`flex items-center justify-center gap-2 rounded-control border-2 border-dashed px-4 py-3 text-xs cursor-pointer transition ${
        uploaded?.uploading ? 'border-border bg-surface-2 opacity-60' : uploaded?.url ? 'border-success/40 bg-success-soft' : 'border-border-strong hover:border-accent hover:bg-surface-2'
      }`}>
        <span className={uploaded?.url ? 'text-success font-medium' : 'text-ink-3'}>
          {uploaded?.uploading ? 'Uploading…' : uploaded?.url ? 'Uploaded — click to replace' : optional ? 'Click to upload (optional)' : 'Click to upload document (PDF/image, max 10MB)'}
        </span>
        <input
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          disabled={uploaded?.uploading}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) onUpload(file)
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}

const emptyForm = {
  onboardingBusinessId: '',
  companyName: '', businessType: '', contactPerson: '', email: '',
  phone: '', gstNumber: '', panNumber: '', category: '', paymentTerms: '',
  creditLimit: '',
  street: '', city: '', state: '', pincode: '',
  accountName: '', accountNumber: '', confirmAccount: '', ifscCode: '', bankName: '',
  yearsInBusiness: '', annualTurnover: '', notes: '',
}

export default function VendorsPage() {
  const router  = useRouter()
  const [showForm, setShowForm]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('Basic Info')
  const [form, setForm]           = useState({ ...emptyForm })
  const [gstWarning, setGstWarning] = useState<string | null>(null)
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const [complianceUploads, setComplianceUploads] = useState<Record<string, { url?: string; number?: string; uploading?: boolean }>>({})
  const [showRequests, setShowRequests] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Owner account search -- explicitly links this vendor entity to an
  // already-registered user (by id, resolved from a search) rather than
  // implicitly matching by the contact email typed above.
  const [ownerSearch, setOwnerSearch] = useState('')
  const [ownerResults, setOwnerResults] = useState<{ _id: string; name: string; email: string }[]>([])
  const [ownerDropOpen, setOwnerDropOpen] = useState(false)
  const [selectedOwner, setSelectedOwner] = useState<{ _id: string; name: string; email: string } | null>(null)

  useEffect(() => {
    if (ownerSearch.length < 2) { setOwnerResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/users?search=${encodeURIComponent(ownerSearch)}&limit=10`)
        .then(r => r.json())
        .then(d => setOwnerResults(d.users || []))
        .catch(() => setOwnerResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [ownerSearch])

  const { data: meData } = useSWR('/api/auth/me')
  const allBusinesses: BusinessOption[] = meData?.businesses || []
  const isSuperAdmin = !!meData?.user?.isSuperAdmin
  // Falls back to the first business only for listing vendors on page
  // load (so the table isn't empty) — this is NOT used to silently
  // pick which business a new vendor gets onboarded under anymore;
  // the onboarding form now requires an explicit choice (see the
  // Compliance tab's business selector below), since defaulting that
  // silently was the exact bug reported ("under which business are we
  // onboarding this vendor?" had no answer in the UI).
  const businessId: string | null = meData?.user?.activeBusinessId ?? meData?.businesses?.[0]?._id ?? null
  // Super admins see every vendor across every business by default
  // (businessId=ALL, see api/vendors/route.ts) -- previously this
  // always scoped to just the ONE active business, so a vendor
  // created under a different business never showed up here even
  // though it existed in the DB, only after switching the active
  // business to match it.
  const seesAllBusinesses = !!(meData?.user?.isSuperAdmin || meData?.user?.isPlatformStaff)

  const vendorsKey = !meData
    ? null
    : seesAllBusinesses
    ? '/api/vendors?businessId=ALL'
    : businessId
    ? `/api/vendors?businessId=${businessId}`
    : null
  const { data: vendorsRes, isLoading: loading, error: vendorsErrorObj, mutate: mutateVendors } = useSWR(vendorsKey)
  const vendors: Vendor[] = vendorsRes ? (Array.isArray(vendorsRes) ? vendorsRes : (vendorsRes.vendors ?? [])) : []

  const { data: requestsRes, mutate: mutateRequests } = useSWR(seesAllBusinesses ? '/api/vendors/requests' : null)
  const unassignedRequests: Vendor[] = requestsRes?.requests ?? []
  const error = vendorsErrorObj ? 'Failed to load vendors' : null

  const selectedOnboardingBusiness = allBusinesses.find(b => b._id === form.onboardingBusinessId)
  const industryComplianceDocs = getComplianceDocsForIndustry(selectedOnboardingBusiness?.industry)
  // vendorDocumentRequirements (this business's own mandatory/optional
  // overrides, set from its admin page) isn't on the lightweight
  // BusinessOption list from /api/auth/me -- fetched separately whenever
  // the onboarding business selection changes.
  const [businessDocOverrides, setBusinessDocOverrides] = useState<{ key: string; mandatory: boolean }[]>([])
  useEffect(() => {
    if (!form.onboardingBusinessId) { setBusinessDocOverrides([]); return }
    let cancelled = false
    fetch(`/api/businesses/${form.onboardingBusinessId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setBusinessDocOverrides(d?.business?.vendorDocumentRequirements || []) })
      .catch(() => { if (!cancelled) setBusinessDocOverrides([]) })
    return () => { cancelled = true }
  }, [form.onboardingBusinessId])
  const { required: requiredCatalogDocs, optional: optionalCatalogDocs } = getVendorDocRequirements(businessDocOverrides)
  const requiredComplianceDocs = [...requiredCatalogDocs, ...industryComplianceDocs]

  async function handleComplianceUpload(doc: ComplianceDocRequirement, file: File) {
    setComplianceUploads(prev => ({ ...prev, [doc.key]: { ...prev[doc.key], uploading: true } }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/assets/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || data.message || 'Upload failed')
      setComplianceUploads(prev => ({ ...prev, [doc.key]: { ...prev[doc.key], url: data.asset?.fileUrl, uploading: false } }))
    } catch {
      setComplianceUploads(prev => ({ ...prev, [doc.key]: { ...prev[doc.key], uploading: false } }))
    }
  }

  // Approve/Reject now live inside VendorDetailModal, wired to the richer
  // /api/vendors/[id]/review flow (audit trail + agreement generation)
  // instead of this bare PUT — see handleVendorUpdated below for how the
  // list reflects the result.
  function handleVendorUpdated(id: string, patch: Partial<Vendor>) {
    mutateVendors((current: any) => {
      if (!current) return current
      const list = Array.isArray(current) ? current : (current.vendors ?? [])
      const updated = list.map((v: Vendor) => (v._id === id ? { ...v, ...patch } : v))
      return Array.isArray(current) ? updated : { ...current, vendors: updated }
    }, { revalidate: false })
    setSelectedVendor(prev => (prev && prev._id === id ? { ...prev, ...patch } : prev))
    // Once a general signup request gets a business assigned (or is
    // rejected), it's no longer "unassigned" — drop it from this queue.
    if (patch.businessId || patch.status === 'REJECTED') {
      mutateRequests((current: any) => {
        if (!current) return current
        return { ...current, requests: (current.requests ?? []).filter((v: Vendor) => v._id !== id) }
      }, { revalidate: false })
    }
  }

  function handleGstBlur() {
    if (!form.gstNumber.trim()) {
      setGstWarning(null)
      return
    }
    const result = validateGSTINAgainstState(form.gstNumber, form.state || undefined)
    setGstWarning(result.valid ? null : result.reason || 'Invalid GSTIN')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.onboardingBusinessId) {
      setFormError('Select which business this vendor is being onboarded under')
      setActiveTab('Compliance')
      return
    }
    if (!form.companyName.trim()) { setFormError('Company name is required'); return }
    if (form.gstNumber.trim()) {
      const gstResult = validateGSTINAgainstState(form.gstNumber, form.state || undefined)
      if (!gstResult.valid) { setFormError(gstResult.reason || 'Invalid GSTIN'); return }
    }
    if (form.pincode.trim() && !/^[1-9][0-9]{5}$/.test(form.pincode.trim())) {
      setFormError('Pincode must be a valid 6-digit Indian PIN code'); return
    }
    if (form.accountNumber && form.accountNumber !== form.confirmAccount) {
      setFormError('Account numbers do not match'); return
    }
    const missingRequiredDocs = requiredComplianceDocs.filter(d => !complianceUploads[d.key]?.url)
    if (missingRequiredDocs.length > 0) {
      setFormError(`Please upload: ${missingRequiredDocs.map(d => d.label).join(', ')}`)
      setActiveTab('Compliance')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const complianceEntries: Record<string, { url?: string; number?: string; uploadedAt: string }> = {}
      for (const key of Object.keys(complianceUploads)) {
        const v = complianceUploads[key]
        if (v.url) {
          complianceEntries[key] = { url: v.url, number: v.number, uploadedAt: new Date().toISOString() }
        }
      }
      const payload = {
        businessId: form.onboardingBusinessId,
        companyName:    form.companyName.trim(),
        businessType:   form.businessType || undefined,
        contactPerson:  form.contactPerson || undefined,
        email:          form.email || undefined,
        ownerUserId:    selectedOwner?._id || undefined,
        phone:          form.phone || undefined,
        gstNumber:      form.gstNumber.trim().toUpperCase() || undefined,
        panNumber:      form.panNumber.trim().toUpperCase() || undefined,
        category:       form.category || undefined,
        paymentTerms:   form.paymentTerms || undefined,
        creditLimit:    form.creditLimit ? Number(form.creditLimit) : undefined,
        address: (form.street || form.city || form.state || form.pincode) ? {
          street:  form.street || undefined,
          city:    form.city   || undefined,
          state:   form.state  || undefined,
          pincode: form.pincode || undefined,
          country: 'India',
        } : undefined,
        bankDetails: form.accountNumber ? {
          accountName:   form.accountName   || undefined,
          accountNumber: form.accountNumber,
          ifscCode:      form.ifscCode.trim().toUpperCase() || undefined,
          bankName:      form.bankName      || undefined,
        } : undefined,
        documents: Object.keys(complianceEntries).length > 0 ? { compliance: complianceEntries } : undefined,
        notes: form.notes || undefined,
      }
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.message ?? d.error ?? 'Failed to onboard vendor')
      }
      setShowForm(false)
      setForm({ ...emptyForm })
      setComplianceUploads({})
      setActiveTab('Basic Info')
      setSelectedOwner(null)
      setOwnerSearch('')
      mutateVendors()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally { setSubmitting(false) }
  }

  function field(name: keyof typeof emptyForm, label: string, opts: {
    type?: string; required?: boolean; placeholder?: string; hint?: string; onBlur?: () => void
  } = {}) {
    const { type = 'text', required = false, placeholder, hint, onBlur } = opts
    return (
      <Field key={name} label={label} required={required} hint={hint}>
        <Input
          type={type}
          required={required}
          value={form[name]}
          placeholder={placeholder}
          onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
          onBlur={onBlur}
        />
      </Field>
    )
  }

  function select(name: keyof typeof emptyForm, label: string, options: string[], required = false) {
    return (
      <Field key={name} label={label} required={required}>
        <SelectControl
          required={required}
          value={form[name]}
          onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
        >
          <option value="">Select…</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </SelectControl>
      </Field>
    )
  }

  // Only top-level vendors get their own row; sub-vendors (parentVendorId
  // set) appear nested under their parent via SubVendorRows instead of as
  // a second flat row for the same entity.
  const topLevelVendors = vendors.filter(v => !v.parentVendorId)

  const stats = [
    { icon: Building2, label: 'Total Vendors',    value: vendors.length },
    { icon: Network,     label: 'With Sub-Vendors', value: vendors.filter(v => (v.subVendorBilling?.subVendorCount || 0) > 0).length },
    { icon: CheckCircle, label: 'Approved',        value: vendors.filter(v => v.isApproved || v.status === 'APPROVED').length },
    { icon: Clock,       label: 'Pending',          value: vendors.filter(v => !v.isApproved && v.status !== 'APPROVED').length },
  ]

  if (loading && vendors.length === 0) return <LoadingPanel label="Loading vendors…" />

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="max-w-[1800px] mx-auto px-6 py-10">

        <PageHeader
          title="Vendors"
          description="Every vendor is a paying tenant of a type — Brand, Service Center, or POS — that can create sub-vendors under itself for an added charge per plan."
          actions={
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setShowForm(true); setActiveTab('Basic Info') }}>
              Onboard Vendor
            </Button>
          }
        />

        {error && (
          <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>
        )}

        {/* Unassigned signup requests — vendors who applied via the general
            /vendor-apply flow without choosing a business. Super-admin only,
            since these aren't scoped to any business yet. */}
        {isSuperAdmin && unassignedRequests.length > 0 && (
          <Card className="mb-8 border-warning/30 bg-warning-soft overflow-hidden">
            <button
              onClick={() => setShowRequests(s => !s)}
              className="w-full flex items-center justify-between px-6 py-4"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-warning" />
                <span className="text-sm font-medium text-ink">
                  {unassignedRequests.length} unassigned vendor signup {unassignedRequests.length === 1 ? 'request' : 'requests'}
                </span>
              </div>
              <span className="text-xs text-warning underline">{showRequests ? 'Hide' : 'Review'}</span>
            </button>
            {showRequests && (
              <div className="border-t border-warning/20 divide-y divide-border bg-surface">
                {unassignedRequests.map(v => (
                  <div
                    key={v._id}
                    onClick={() => setSelectedVendor(v)}
                    className="px-6 py-3 flex items-center justify-between hover:bg-surface-2 cursor-pointer transition"
                  >
                    <div>
                      <p className="font-medium text-ink">{v.companyName}</p>
                      <p className="text-xs text-ink-3">
                        {v.requestNumber || v.vendorId} · {v.contactPerson} · {v.email}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setSelectedVendor(v) }}>
                      Review
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ icon: Icon, label, value }) => (
            <Card key={label} className="p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-ink-3">{label}</span>
                <div className="w-8 h-8 rounded-control bg-surface-2 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-ink-2" />
                </div>
              </div>
              <p className="text-2xl font-semibold text-ink">{value}</p>
            </Card>
          ))}
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Truck className="w-4 h-4 text-ink-3" />
            <h2 className="h-section">All Vendors</h2>
          </div>
          {topLevelVendors.length === 0 ? (
            <EmptyState kind="empty" title="No vendors yet" description="Onboard your first vendor to get started." action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowForm(true)}>Onboard Vendor</Button>} />
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 text-xs text-ink-3 font-medium">Company</th>
                  <th className="text-left px-6 py-3 text-xs text-ink-3 font-medium">Type</th>
                  {isSuperAdmin && <th className="text-left px-6 py-3 text-xs text-ink-3 font-medium">Business</th>}
                  <th className="text-left px-6 py-3 text-xs text-ink-3 font-medium">Contact</th>
                  <th className="text-left px-6 py-3 text-xs text-ink-3 font-medium">GST</th>
                  <th className="text-left px-6 py-3 text-xs text-ink-3 font-medium">Sub-Vendors</th>
                  <th className="text-center px-6 py-3 text-xs text-ink-3 font-medium">Rating</th>
                  <th className="text-center px-6 py-3 text-xs text-ink-3 font-medium">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topLevelVendors.map(v => {
                  const isApproved = v.isApproved || v.status === 'APPROVED'
                  const statusKey  = isApproved ? 'APPROVED' : (v.status ?? 'PENDING')
                  // A vendor still going through review (APPLIED/PENDING) or
                  // awaiting agreement finalization opens the review modal
                  // (approve/reject/finalize actions); an onboarded vendor
                  // opens the full detail page instead.
                  const needsReviewModal = ['APPLIED', 'PENDING', 'AGREEMENT_SIGNED', 'AGREEMENT_CANCELLED'].includes(v.status || '')
                  const openVendor = () => needsReviewModal ? setSelectedVendor(v) : router.push(`/admin/vendors/${v._id}`)
                  const subCount = v.subVendorBilling?.subVendorCount || 0
                  const isExpanded = expandedId === v._id
                  return (
                    <Fragment key={v._id}>
                    <tr onClick={openVendor} className="hover:bg-surface-2 transition cursor-pointer">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          {subCount > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : v._id) }}
                              className="w-5 h-5 rounded-control bg-surface-2 flex items-center justify-center hover:bg-surface-3 shrink-0"
                            >
                              <ChevronDown className={`w-3.5 h-3.5 text-ink-3 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                            </button>
                          )}
                          <div>
                            <p className="font-medium text-ink">{v.companyName}</p>
                            {v.address?.city && <p className="text-xs text-ink-3">{v.address.city}{v.address.state ? `, ${v.address.state}` : ''}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        {v.appliedAs ? <Badge tone={TYPE_TONE[v.appliedAs]}>{TYPE_LABEL[v.appliedAs]}</Badge> : <span className="text-ink-3">—</span>}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-6 py-3 text-sm text-ink-2">
                          {typeof v.businessId === 'object' && v.businessId
                            ? (v.businessId as any).brandName || (v.businessId as any).name || '—'
                            : '—'}
                        </td>
                      )}
                      <td className="px-6 py-3">
                        <p className="text-ink-2">{v.contactPerson ?? '—'}</p>
                        {v.phone && <p className="text-xs text-ink-3">{v.phone}</p>}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-ink-3">{v.gstNumber ?? '—'}</td>
                      <td className="px-6 py-3">
                        {subCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                            <Users className="w-3.5 h-3.5 text-ink-3" /> {subCount}
                          </span>
                        ) : <span className="text-ink-3 text-sm">—</span>}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex justify-center"><StarRating rating={v.rating ?? 0} /></div>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <Badge tone={STATUS_TONE[statusKey] ?? 'neutral'}>{statusKey}</Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openVendor() }}>View</Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <SubVendorRows parentId={v._id} onOpen={(id) => router.push(`/admin/vendors/${id}`)} />
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      </div>

      {/* Centered modal (was a right-side slide-over) */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="relative w-full max-w-2xl max-h-[90vh] bg-surface border border-border rounded-card flex flex-col overflow-hidden shadow-card-lg">

            {/* Form header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <div>
                <h2 className="h-section">Onboard Vendor</h2>
                <p className="text-xs text-ink-3 mt-0.5">Fill in vendor details to add them to your business</p>
              </div>
              <button onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-control bg-surface-2 border border-border flex items-center justify-center hover:bg-surface-3 transition">
                <X className="w-4 h-4 text-ink-2" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border px-6 pt-3 gap-1">
              {TABS.map((tab, i) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`pb-2.5 px-2 text-xs font-medium transition border-b-2 -mb-px flex items-center gap-1.5 ${
                    activeTab === tab ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'
                  }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    activeTab === tab ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-ink-3'
                  }`}>{i + 1}</span>
                  {tab}
                </button>
              ))}
            </div>

            {/* Form content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {formError && (
                <div className="mb-4 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{formError}</div>
              )}

              {activeTab === 'Basic Info' && (
                <div className="space-y-4">
                  {field('companyName', 'Company Name', { required: true, placeholder: 'ABC Suppliers Pvt. Ltd.' })}
                  {select('businessType', 'Business Type', ['Manufacturer','Trader','Service Provider','Importer','Distributor'])}
                  <div className="grid grid-cols-2 gap-4">
                    {field('contactPerson', 'Contact Person', { placeholder: 'Full name' })}
                    {field('phone', 'Phone', { type: 'tel', placeholder: '+91 98765 43210' })}
                  </div>
                  {field('email', 'Email Address', { type: 'email', placeholder: 'vendor@company.com' })}

                  <Field
                    label="Owner Account (registered user)"
                    hint="Must already be a registered account — this user becomes the vendor's Owner once approved. Leave blank to link by the email above at approval time instead."
                  >
                    {selectedOwner ? (
                      <div className="flex items-center justify-between px-4 py-2.5 bg-surface border border-border-strong rounded-control">
                        <div>
                          <p className="text-sm text-ink">{selectedOwner.name}</p>
                          <p className="text-xs text-ink-3">{selectedOwner.email}</p>
                        </div>
                        <button type="button" onClick={() => { setSelectedOwner(null); setOwnerSearch('') }} className="text-ink-3 hover:text-ink">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          type="text"
                          value={ownerSearch}
                          onChange={(e) => { setOwnerSearch(e.target.value); setOwnerDropOpen(true) }}
                          onFocus={() => setOwnerDropOpen(true)}
                          placeholder="Search by registered user ID or email…"
                        />
                        {ownerDropOpen && ownerResults.length > 0 && (
                          <div className="absolute z-10 mt-1 w-full bg-surface border border-border-strong rounded-control overflow-hidden shadow-card-lg">
                            {ownerResults.map((u) => (
                              <button
                                type="button"
                                key={u._id}
                                className="w-full px-4 py-2.5 text-left hover:bg-surface-2 transition"
                                onClick={() => { setSelectedOwner(u); setOwnerDropOpen(false); setOwnerSearch('') }}
                              >
                                <p className="text-sm text-ink">{u.name}</p>
                                <p className="text-xs text-ink-3">{u.email}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    {field('gstNumber', 'GSTIN', { placeholder: '27AABCU9603R1ZX', hint: gstWarning || '15-digit GST Identification Number', onBlur: handleGstBlur })}
                    {field('panNumber', 'PAN Number', { placeholder: 'AABCU9603R', hint: '10-character PAN' })}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {select('category', 'Category', CATEGORIES)}
                    {select('paymentTerms', 'Payment Terms', PAYMENT_TERMS)}
                  </div>
                  {field('creditLimit', 'Credit Limit (₹)', { type: 'number', placeholder: '100000' })}
                </div>
              )}

              {activeTab === 'Address' && (
                <div className="space-y-4">
                  <Field label="Street Address">
                    <Textarea value={form.street} onChange={e => setForm(p => ({ ...p, street: e.target.value }))}
                      rows={2} placeholder="Building, street, area" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="City">
                      <CitySelect
                        value={form.city}
                        state={form.state}
                        onChange={(value) => setForm(p => ({ ...p, city: value }))}
                        className="w-full bg-surface border border-border-strong rounded-control px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft"
                      />
                    </Field>
                    <Field label="Pincode" hint="6-digit PIN code">
                      <PincodeInput
                        value={form.pincode}
                        onChange={(value) => setForm(p => ({ ...p, pincode: value }))}
                        onResolved={({ state, city }) =>
                          setForm(p => ({
                            ...p,
                            // Only autofill if not already set — don't clobber a deliberate user choice
                            state: p.state || state,
                            city: p.city || city,
                          }))
                        }
                        placeholder="400001"
                        className="w-full bg-surface border border-border-strong rounded-control px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft"
                      />
                    </Field>
                  </div>
                  <Field label="State">
                    <StateSelect
                      value={form.state}
                      onChange={(value) => setForm(p => ({ ...p, state: value, city: '' }))}
                      className="w-full bg-surface border border-border-strong rounded-control px-4 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft"
                    />
                  </Field>
                  <div className="mt-2 px-4 py-3 rounded-control bg-surface-2 border border-border text-xs text-ink-3">
                    Country is set to <strong className="text-ink-2">India</strong> by default.
                  </div>
                </div>
              )}

              {activeTab === 'Bank Details' && (
                <div className="space-y-4">
                  <div className="px-4 py-3 rounded-control bg-warning-soft border border-warning/20 text-xs text-warning">
                    Bank details are stored securely and used only for payment processing.
                  </div>
                  {field('bankName', 'Bank Name', { placeholder: 'State Bank of India' })}
                  {field('accountName', 'Account Holder Name', { placeholder: 'ABC Suppliers Pvt. Ltd.' })}
                  {field('ifscCode', 'IFSC Code', { placeholder: 'SBIN0001234', hint: '11-character IFSC code' })}
                  {field('accountNumber', 'Account Number', { type: 'password', placeholder: 'Enter account number' })}
                  {field('confirmAccount', 'Confirm Account Number', { placeholder: 'Re-enter account number' })}
                  {form.accountNumber && form.confirmAccount && form.accountNumber !== form.confirmAccount && (
                    <p className="text-xs text-danger">Account numbers do not match</p>
                  )}
                  {form.accountNumber && form.confirmAccount && form.accountNumber === form.confirmAccount && (
                    <p className="text-xs text-success flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Account numbers match</p>
                  )}
                </div>
              )}

              {activeTab === 'Compliance' && (
                <div className="space-y-4">
                  <Field
                    label="Onboarding Business"
                    required
                    hint="Every vendor belongs to exactly one business — this determines which business's catalog, documents, and required compliance checks apply."
                  >
                    <SelectControl
                      required
                      value={form.onboardingBusinessId}
                      onChange={e => setForm(p => ({ ...p, onboardingBusinessId: e.target.value }))}
                    >
                      <option value="">Select which business is onboarding this vendor…</option>
                      {allBusinesses.map(b => (
                        <option key={b._id} value={b._id}>{b.brandName || b.name}</option>
                      ))}
                    </SelectControl>
                  </Field>

                  {selectedOnboardingBusiness && (
                    <div className="space-y-3 pt-2">
                      <p className="text-xs font-medium text-ink-2">
                        Required documents — this business's settings
                      </p>
                      {requiredCatalogDocs.map(doc => (
                        <ComplianceDocCard
                          key={doc.key}
                          doc={doc}
                          uploaded={complianceUploads[doc.key]}
                          onNumberChange={(v) => setComplianceUploads(prev => ({ ...prev, [doc.key]: { ...prev[doc.key], number: v } }))}
                          onUpload={(file) => handleComplianceUpload(doc, file)}
                        />
                      ))}
                    </div>
                  )}

                  {industryComplianceDocs.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <p className="text-xs font-medium text-ink-2">
                        Required documents for {selectedOnboardingBusiness?.brandName || selectedOnboardingBusiness?.name}&apos;s industry
                      </p>
                      {industryComplianceDocs.map(doc => (
                        <ComplianceDocCard
                          key={doc.key}
                          doc={doc}
                          uploaded={complianceUploads[doc.key]}
                          onNumberChange={(v) => setComplianceUploads(prev => ({ ...prev, [doc.key]: { ...prev[doc.key], number: v } }))}
                          onUpload={(file) => handleComplianceUpload(doc, file)}
                        />
                      ))}
                    </div>
                  )}

                  {selectedOnboardingBusiness && industryComplianceDocs.length === 0 && (
                    <p className="text-xs text-ink-3 italic">
                      No additional industry-specific compliance documents required for this business.
                    </p>
                  )}

                  {selectedOnboardingBusiness && optionalCatalogDocs.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <p className="text-xs font-medium text-ink-2">Optional documents</p>
                      {optionalCatalogDocs.map(doc => (
                        <ComplianceDocCard
                          key={doc.key}
                          doc={doc}
                          optional
                          uploaded={complianceUploads[doc.key]}
                          onNumberChange={(v) => setComplianceUploads(prev => ({ ...prev, [doc.key]: { ...prev[doc.key], number: v } }))}
                          onUpload={(file) => handleComplianceUpload(doc, file)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'Additional' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {field('yearsInBusiness', 'Years in Business', { type: 'number', placeholder: '5' })}
                    {select('annualTurnover', 'Annual Turnover', [
                      'Under ₹25 Lakh', '₹25L – ₹1 Cr', '₹1 Cr – ₹5 Cr',
                      '₹5 Cr – ₹25 Cr', '₹25 Cr – ₹100 Cr', 'Above ₹100 Cr',
                    ])}
                  </div>
                  <Field label="Internal Notes">
                    <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                      rows={4} placeholder="Any internal notes about this vendor..." />
                  </Field>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-border flex items-center gap-3">
              {/* Back / Next tabs */}
              {activeTab !== 'Basic Info' && (
                <Button
                  type="button"
                  variant="secondary"
                  icon={<ChevronLeft className="w-4 h-4" />}
                  onClick={() => setActiveTab(TABS[TABS.indexOf(activeTab) - 1])}
                >
                  Back
                </Button>
              )}

              {activeTab !== 'Additional' ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setActiveTab(TABS[TABS.indexOf(activeTab) + 1])}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              ) : null}

              <Button
                className={activeTab === 'Additional' ? 'flex-1' : ''}
                onClick={handleSubmit}
                loading={submitting}
              >
                {submitting ? 'Saving…' : 'Onboard Vendor'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedVendor && (
        <VendorDetailModal
          vendor={selectedVendor}
          onClose={() => setSelectedVendor(null)}
          onUpdated={(patch) => handleVendorUpdated(selectedVendor._id, patch)}
        />
      )}
    </div>
  )
}
