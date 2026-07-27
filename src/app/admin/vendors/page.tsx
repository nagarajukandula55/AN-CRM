'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Plus, X, Building2, CheckCircle,
  Clock, Star, ChevronRight, ChevronLeft, Truck,
} from 'lucide-react'
import { StateSelect, CitySelect, PincodeInput } from '@/components/shared/LocationSelect'
import { validateGSTINAgainstState } from '@/lib/validation/gst'
import { VendorDetailModal, VendorDetailData } from '@/components/shared/VendorDetailModal'
import { getComplianceDocsForIndustry, getVendorDocRequirements, type ComplianceDocRequirement } from '@/core/vendorCompliance'

type Vendor = VendorDetailData

interface BusinessOption { _id: string; name: string; brandName?: string; industry?: string }

const CATEGORIES = [
  'Raw Materials','Packaging','Electronics','Machinery','Services',
  'Logistics','IT & Software','Office Supplies','Utilities','Other',
]

const PAYMENT_TERMS = [
  'Immediate','Net 7','Net 15','Net 30','Net 45','Net 60','Net 90',
]

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-700',
  PENDING:  'bg-yellow-100 text-yellow-700',
  ACTIVE:   'bg-blue-100 text-blue-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
  REJECTED: 'bg-red-100 text-red-700',
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <Star key={s} className={`w-3 h-3 ${s <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
      ))}
    </div>
  )
}

const TABS = ['Basic Info', 'Address', 'Bank Details', 'Compliance', 'Additional'] as const
type Tab = typeof TABS[number]

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
      <div key={name}>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <input
          type={type}
          required={required}
          value={form[name]}
          placeholder={placeholder}
          onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
          onBlur={onBlur}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition"
        />
        {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
      </div>
    )
  }

  function select(name: keyof typeof emptyForm, label: string, options: string[], required = false) {
    return (
      <div key={name}>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <select
          required={required}
          value={form[name]}
          onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 transition appearance-none"
        >
          <option value="">Select…</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    )
  }

  const stats = [
    { icon: Building2, label: 'Total Vendors',    value: vendors.length },
    { icon: CheckCircle, label: 'Approved',        value: vendors.filter(v => v.isApproved || v.status === 'APPROVED').length },
    { icon: Clock,       label: 'Pending',          value: vendors.filter(v => !v.isApproved && v.status !== 'APPROVED').length },
    { icon: Star,        label: 'Active',           value: vendors.filter(v => v.status === 'ACTIVE').length },
  ]

  if (loading && vendors.length === 0) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.push('/admin')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition">
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Vendors</h1>
            <p className="text-sm text-gray-400 mt-0.5">Vendor onboarding and management</p>
          </div>
          <button onClick={() => { setShowForm(true); setActiveTab('Basic Info') }}
            className="ml-auto flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-800 transition">
            <Plus className="w-4 h-4" /> Onboard Vendor
          </button>
        </div>

        {error && (
          <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
        )}

        {/* Unassigned signup requests — vendors who applied via the general
            /vendor-apply flow without choosing a business. Super-admin only,
            since these aren't scoped to any business yet. */}
        {isSuperAdmin && unassignedRequests.length > 0 && (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
            <button
              onClick={() => setShowRequests(s => !s)}
              className="w-full flex items-center justify-between px-6 py-4"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-900">
                  {unassignedRequests.length} unassigned vendor signup {unassignedRequests.length === 1 ? 'request' : 'requests'}
                </span>
              </div>
              <span className="text-xs text-amber-700 underline">{showRequests ? 'Hide' : 'Review'}</span>
            </button>
            {showRequests && (
              <div className="border-t border-amber-200 divide-y divide-amber-100 bg-white">
                {unassignedRequests.map(v => (
                  <div
                    key={v._id}
                    onClick={() => setSelectedVendor(v)}
                    className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{v.companyName}</p>
                      <p className="text-xs text-gray-400">
                        {v.requestNumber || v.vendorId} · {v.contactPerson} · {v.email}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedVendor(v) }}
                      className="px-3 py-1 rounded-lg bg-gray-50 text-gray-700 border border-gray-200 text-xs font-medium hover:bg-gray-100 transition"
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">{label}</span>
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-gray-600" />
                </div>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Truck className="w-4 h-4 text-gray-400" />
            <h2 className="font-medium text-gray-700 text-sm">All Vendors</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs text-gray-400 font-medium">Company</th>
                  {isSuperAdmin && <th className="text-left px-6 py-3 text-xs text-gray-400 font-medium">Business</th>}
                  <th className="text-left px-6 py-3 text-xs text-gray-400 font-medium">Contact</th>
                  <th className="text-left px-6 py-3 text-xs text-gray-400 font-medium">Category</th>
                  <th className="text-left px-6 py-3 text-xs text-gray-400 font-medium">GST</th>
                  <th className="text-left px-6 py-3 text-xs text-gray-400 font-medium">Payment Terms</th>
                  <th className="text-center px-6 py-3 text-xs text-gray-400 font-medium">Rating</th>
                  <th className="text-center px-6 py-3 text-xs text-gray-400 font-medium">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vendors.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 9 : 8} className="px-6 py-12 text-center">
                      <Truck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-400">No vendors yet. Onboard your first vendor.</p>
                    </td>
                  </tr>
                ) : vendors.map(v => {
                  const isApproved = v.isApproved || v.status === 'APPROVED'
                  const statusKey  = isApproved ? 'APPROVED' : (v.status ?? 'PENDING')
                  // A vendor still going through review (APPLIED/PENDING) or
                  // awaiting agreement finalization opens the review modal
                  // (approve/reject/finalize actions); an onboarded vendor
                  // opens the full detail page instead.
                  const needsReviewModal = ['APPLIED', 'PENDING', 'AGREEMENT_SIGNED', 'AGREEMENT_CANCELLED'].includes(v.status || '')
                  const openVendor = () => needsReviewModal ? setSelectedVendor(v) : router.push(`/admin/vendors/${v._id}`)
                  return (
                    <tr key={v._id} onClick={openVendor} className="hover:bg-gray-50 transition cursor-pointer">
                      <td className="px-6 py-3">
                        <p className="font-medium text-gray-900">{v.companyName}</p>
                        {v.address?.city && <p className="text-xs text-gray-400">{v.address.city}{v.address.state ? `, ${v.address.state}` : ''}</p>}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-6 py-3 text-sm text-gray-600">
                          {typeof v.businessId === 'object' && v.businessId
                            ? (v.businessId as any).brandName || (v.businessId as any).name || '—'
                            : '—'}
                        </td>
                      )}
                      <td className="px-6 py-3">
                        <p className="text-gray-700">{v.contactPerson ?? '—'}</p>
                        {v.phone && <p className="text-xs text-gray-400">{v.phone}</p>}
                      </td>
                      <td className="px-6 py-3 text-gray-500">{v.category ?? '—'}</td>
                      <td className="px-6 py-3 font-mono text-xs text-gray-500">{v.gstNumber ?? '—'}</td>
                      <td className="px-6 py-3 text-gray-500">{v.paymentTerms ?? '—'}</td>
                      <td className="px-6 py-3">
                        <div className="flex justify-center"><StarRating rating={v.rating ?? 0} /></div>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[statusKey] ?? 'bg-gray-100 text-gray-500'}`}>
                          {statusKey}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); openVendor() }}
                          className="px-3 py-1 rounded-lg bg-gray-50 text-gray-700 border border-gray-200 text-xs font-medium hover:bg-gray-100 transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Centered modal (was a right-side slide-over) */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-2xl max-h-[90vh] bg-white border border-gray-200 rounded-2xl flex flex-col overflow-hidden shadow-2xl">

            {/* Form header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">Onboard Vendor</h2>
                <p className="text-xs text-gray-400 mt-0.5">Fill in vendor details to add them to your business</p>
              </div>
              <button onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6 pt-3 gap-1">
              {TABS.map((tab, i) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`pb-2.5 px-2 text-xs font-medium transition border-b-2 -mb-px flex items-center gap-1.5 ${
                    activeTab === tab ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    activeTab === tab ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>{i + 1}</span>
                  {tab}
                </button>
              ))}
            </div>

            {/* Form content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {formError && (
                <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{formError}</div>
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

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                      Owner Account (registered user)
                    </label>
                    {selectedOwner ? (
                      <div className="flex items-center justify-between px-4 py-2.5 bg-white border border-gray-200 rounded-xl">
                        <div>
                          <p className="text-sm text-gray-900">{selectedOwner.name}</p>
                          <p className="text-xs text-gray-500">{selectedOwner.email}</p>
                        </div>
                        <button type="button" onClick={() => { setSelectedOwner(null); setOwnerSearch('') }} className="text-gray-500 hover:text-gray-900">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          value={ownerSearch}
                          onChange={(e) => { setOwnerSearch(e.target.value); setOwnerDropOpen(true) }}
                          onFocus={() => setOwnerDropOpen(true)}
                          placeholder="Search by registered user ID or email…"
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition"
                        />
                        {ownerDropOpen && ownerResults.length > 0 && (
                          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xl">
                            {ownerResults.map((u) => (
                              <button
                                type="button"
                                key={u._id}
                                className="w-full px-4 py-2.5 text-left hover:bg-gray-50 transition"
                                onClick={() => { setSelectedOwner(u); setOwnerDropOpen(false); setOwnerSearch('') }}
                              >
                                <p className="text-sm text-gray-900">{u.name}</p>
                                <p className="text-xs text-gray-500">{u.email}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      Must already be a registered account — this user becomes the vendor's Owner once approved. Leave blank to link by the email above at approval time instead.
                    </p>
                  </div>

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
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Street Address</label>
                    <textarea value={form.street} onChange={e => setForm(p => ({ ...p, street: e.target.value }))}
                      rows={2} placeholder="Building, street, area"
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">City</label>
                      <CitySelect
                        value={form.city}
                        state={form.state}
                        onChange={(value) => setForm(p => ({ ...p, city: value }))}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Pincode</label>
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
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">6-digit PIN code</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">State</label>
                    <StateSelect
                      value={form.state}
                      onChange={(value) => setForm(p => ({ ...p, state: value, city: '' }))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 transition appearance-none"
                    />
                  </div>
                  <div className="mt-2 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500">
                    Country is set to <strong>India</strong> by default.
                  </div>
                </div>
              )}

              {activeTab === 'Bank Details' && (
                <div className="space-y-4">
                  <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
                    Bank details are stored securely and used only for payment processing.
                  </div>
                  {field('bankName', 'Bank Name', { placeholder: 'State Bank of India' })}
                  {field('accountName', 'Account Holder Name', { placeholder: 'ABC Suppliers Pvt. Ltd.' })}
                  {field('ifscCode', 'IFSC Code', { placeholder: 'SBIN0001234', hint: '11-character IFSC code' })}
                  {field('accountNumber', 'Account Number', { type: 'password', placeholder: 'Enter account number' })}
                  {field('confirmAccount', 'Confirm Account Number', { placeholder: 'Re-enter account number' })}
                  {form.accountNumber && form.confirmAccount && form.accountNumber !== form.confirmAccount && (
                    <p className="text-xs text-red-500">Account numbers do not match</p>
                  )}
                  {form.accountNumber && form.confirmAccount && form.accountNumber === form.confirmAccount && (
                    <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Account numbers match</p>
                  )}
                </div>
              )}

              {activeTab === 'Compliance' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                      Onboarding Business<span className="text-red-500 ml-0.5">*</span>
                    </label>
                    <select
                      required
                      value={form.onboardingBusinessId}
                      onChange={e => setForm(p => ({ ...p, onboardingBusinessId: e.target.value }))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 transition appearance-none"
                    >
                      <option value="">Select which business is onboarding this vendor…</option>
                      {allBusinesses.map(b => (
                        <option key={b._id} value={b._id}>{b.brandName || b.name}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Every vendor belongs to exactly one business — this determines which business's
                      catalog, documents, and required compliance checks apply.
                    </p>
                  </div>

                  {selectedOnboardingBusiness && (
                    <div className="space-y-3 pt-2">
                      <p className="text-xs font-medium text-gray-700">
                        Required documents — this business's settings
                      </p>
                      {requiredCatalogDocs.map(doc => {
                        const uploaded = complianceUploads[doc.key]
                        return (
                          <div key={doc.key} className="rounded-xl border border-gray-200 p-4">
                            <p className="text-sm font-medium text-gray-900">{doc.label}<span className="text-red-500 ml-0.5">*</span></p>
                            {doc.helpText && <p className="text-[11px] text-gray-400 mt-0.5 mb-2">{doc.helpText}</p>}

                            {doc.collectNumber && (
                              <input
                                type="text"
                                placeholder={doc.numberLabel || 'License number'}
                                value={uploaded?.number || ''}
                                onChange={e => setComplianceUploads(prev => ({ ...prev, [doc.key]: { ...prev[doc.key], number: e.target.value } }))}
                                className="w-full mb-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                              />
                            )}

                            <label className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-xs cursor-pointer transition ${
                              uploaded?.uploading ? 'border-gray-200 bg-gray-50 opacity-60' : uploaded?.url ? 'border-emerald-300 bg-emerald-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                            }`}>
                              <span className={uploaded?.url ? 'text-emerald-700 font-medium' : 'text-gray-500'}>
                                {uploaded?.uploading ? 'Uploading…' : uploaded?.url ? 'Uploaded — click to replace' : 'Click to upload document (PDF/image, max 10MB)'}
                              </span>
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                disabled={uploaded?.uploading}
                                onChange={e => {
                                  const file = e.target.files?.[0]
                                  if (file) handleComplianceUpload(doc, file)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {industryComplianceDocs.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <p className="text-xs font-medium text-gray-700">
                        Required documents for {selectedOnboardingBusiness?.brandName || selectedOnboardingBusiness?.name}&apos;s industry
                      </p>
                      {industryComplianceDocs.map(doc => {
                        const uploaded = complianceUploads[doc.key]
                        return (
                          <div key={doc.key} className="rounded-xl border border-gray-200 p-4">
                            <p className="text-sm font-medium text-gray-900">{doc.label}<span className="text-red-500 ml-0.5">*</span></p>
                            {doc.helpText && <p className="text-[11px] text-gray-400 mt-0.5 mb-2">{doc.helpText}</p>}

                            {doc.collectNumber && (
                              <input
                                type="text"
                                placeholder={doc.numberLabel || 'License number'}
                                value={uploaded?.number || ''}
                                onChange={e => setComplianceUploads(prev => ({ ...prev, [doc.key]: { ...prev[doc.key], number: e.target.value } }))}
                                className="w-full mb-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                              />
                            )}

                            <label className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-xs cursor-pointer transition ${
                              uploaded?.uploading ? 'border-gray-200 bg-gray-50 opacity-60' : uploaded?.url ? 'border-emerald-300 bg-emerald-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                            }`}>
                              <span className={uploaded?.url ? 'text-emerald-700 font-medium' : 'text-gray-500'}>
                                {uploaded?.uploading ? 'Uploading…' : uploaded?.url ? 'Uploaded — click to replace' : 'Click to upload document'}
                              </span>
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                disabled={uploaded?.uploading}
                                onChange={e => {
                                  const file = e.target.files?.[0]
                                  if (file) handleComplianceUpload(doc, file)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {selectedOnboardingBusiness && industryComplianceDocs.length === 0 && (
                    <p className="text-xs text-gray-400 italic">
                      No additional industry-specific compliance documents required for this business.
                    </p>
                  )}

                  {selectedOnboardingBusiness && optionalCatalogDocs.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <p className="text-xs font-medium text-gray-700">Optional documents</p>
                      {optionalCatalogDocs.map(doc => {
                        const uploaded = complianceUploads[doc.key]
                        return (
                          <div key={doc.key} className="rounded-xl border border-gray-200 p-4">
                            <p className="text-sm font-medium text-gray-900">{doc.label}</p>
                            {doc.helpText && <p className="text-[11px] text-gray-400 mt-0.5 mb-2">{doc.helpText}</p>}
                            {doc.collectNumber && (
                              <input
                                type="text"
                                placeholder={doc.numberLabel || 'License number'}
                                value={uploaded?.number || ''}
                                onChange={e => setComplianceUploads(prev => ({ ...prev, [doc.key]: { ...prev[doc.key], number: e.target.value } }))}
                                className="w-full mb-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                              />
                            )}
                            <label className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-xs cursor-pointer transition ${
                              uploaded?.uploading ? 'border-gray-200 bg-gray-50 opacity-60' : uploaded?.url ? 'border-emerald-300 bg-emerald-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                            }`}>
                              <span className={uploaded?.url ? 'text-emerald-700 font-medium' : 'text-gray-500'}>
                                {uploaded?.uploading ? 'Uploading…' : uploaded?.url ? 'Uploaded — click to replace' : 'Click to upload (optional)'}
                              </span>
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                disabled={uploaded?.uploading}
                                onChange={e => {
                                  const file = e.target.files?.[0]
                                  if (file) handleComplianceUpload(doc, file)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                          </div>
                        )
                      })}
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
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Internal Notes</label>
                    <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                      rows={4} placeholder="Any internal notes about this vendor..."
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition resize-none" />
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
              {/* Back / Next tabs */}
              {activeTab !== 'Basic Info' && (
                <button type="button"
                  onClick={() => setActiveTab(TABS[TABS.indexOf(activeTab) - 1])}
                  className="flex items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}

              {activeTab !== 'Additional' ? (
                <button type="button"
                  onClick={() => setActiveTab(TABS[TABS.indexOf(activeTab) + 1])}
                  className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              ) : null}

              <button onClick={handleSubmit} disabled={submitting}
                className={`${activeTab !== 'Additional' ? 'px-4' : 'flex-1'} flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50`}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submitting ? 'Saving…' : 'Onboard Vendor'}
              </button>
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
