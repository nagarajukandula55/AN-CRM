'use client'

/**
 * Full vendor detail page — replaces the old VendorDetailModal side-popup
 * for actually viewing a vendor (the modal is still used elsewhere for the
 * approve/reject/finalize review workflow on pending applications; this
 * page is the professional, permanent record view for an onboarded vendor:
 * facility IDs, current staff roster, agreement status, documents).
 */

import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Building2, Store, Warehouse, Wrench,
  Users, FileText, CreditCard, MapPin, ShieldCheck, Plus, X, Layers,
} from 'lucide-react'
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from '@/core/catalog/deviceCategory'
import { LoadingPanel, Spinner } from '@/components/ui/Spinner'

interface StaffMember {
  _id: string
  userId?: { _id: string; name?: string; email?: string; username?: string }
  vendorRole?: string
  memberType?: string
  status?: string
  joinedAt?: string
}

interface OwnerUser {
  _id: string
  name?: string
  email?: string
  username?: string
}

interface UserSearchResult {
  _id: string
  name?: string
  email?: string
  username?: string
}

interface VendorData {
  _id: string
  vendorId?: string
  companyName: string
  userId?: OwnerUser | null
  contactPerson?: string
  email?: string
  phone?: string
  gstNumber?: string
  panNumber?: string
  category?: string
  businessType?: string
  paymentTerms?: string
  creditLimit?: number
  rating?: number
  status?: string
  isApproved?: boolean
  businessId?: string | { _id: string; name?: string; legalName?: string; brandName?: string }
  address?: { street?: string; city?: string; state?: string; pincode?: string }
  bankDetails?: { accountName?: string; accountNumber?: string; ifscCode?: string; bankName?: string }
  documents?: {
    passbookUrl?: string
    gstCertificateUrl?: string
    compliance?: Record<string, { url?: string; label?: string; number?: string }>
  }
  agreementId?: string
  productCategories?: DeviceCategory[]
  enableStoreFront?: boolean
  enableServiceCenter?: boolean
  enableWarehouse?: boolean
  storeFrontId?: string | null
  serviceCenterId?: string | null
  warehouseFacilityId?: string | null
}

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-success-soft text-success',
  PENDING: 'bg-warning-soft text-warning',
  ACTIVE: 'bg-info-soft text-info',
  INACTIVE: 'bg-surface-2 text-ink-3',
  REJECTED: 'bg-danger-soft text-danger',
  AGREEMENT_SIGNED: 'bg-accent-soft text-accent',
  AGREEMENT_DRAFTED: 'bg-accent-soft text-accent',
}

function businessLabel(businessId: VendorData['businessId']): string {
  if (!businessId) return '—'
  if (typeof businessId === 'string') return businessId
  return businessId.brandName || businessId.legalName || businessId.name || businessId._id
}

// Shared search-and-assign box for Owner/Manager, since both are the same
// "search existing users, pick one" interaction against the same
// /api/admin/users search endpoint -- only what happens on pick differs.
function UserSearchPicker({
  search,
  onSearchChange,
  results,
  searching,
  saving,
  error,
  onPick,
  onCancel,
}: {
  search: string
  onSearchChange: (q: string) => void
  results: UserSearchResult[]
  searching: boolean
  saving: boolean
  error: string | null
  onPick: (u: UserSearchResult) => void
  onCancel: () => void
}) {
  return (
    <div className="mt-2 rounded-card border border-border p-3 space-y-2">
      {error && <p className="text-xs text-danger">{error}</p>}
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by name, email, or user ID…"
        autoFocus
        className="w-full bg-surface border border-border rounded-control px-3 py-2 text-xs text-ink placeholder-ink-3 outline-none focus:border-border-strong transition"
      />
      {searching ? (
        <p className="text-xs text-ink-3 py-2 text-center">Searching…</p>
      ) : results.length > 0 ? (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {results.map((u) => (
            <button
              key={u._id}
              type="button"
              disabled={saving}
              onClick={() => onPick(u)}
              className="w-full text-left px-3 py-2 rounded-control hover:bg-surface-2 transition disabled:opacity-50"
            >
              <p className="text-xs font-medium text-ink truncate">{u.name || u.username || 'Unknown'}</p>
              <p className="text-[11px] text-ink-3 truncate">{u.email}</p>
            </button>
          ))}
        </div>
      ) : search.trim() ? (
        <p className="text-xs text-ink-3 py-2 text-center">No matching users found</p>
      ) : null}
      <button
        type="button"
        onClick={onCancel}
        className="w-full py-1.5 text-xs text-ink-3 hover:text-ink-2 transition"
      >
        Cancel
      </button>
    </div>
  )
}

function FacilityCard({
  icon: Icon,
  label,
  enabled,
  facilityId,
}: {
  icon: React.ElementType
  label: string
  enabled?: boolean
  facilityId?: string | null
}) {
  return (
    <div className={`rounded-card border p-5 ${enabled ? 'border-border bg-surface' : 'border-border bg-surface-2'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-card flex items-center justify-center ${enabled ? 'bg-accent' : 'bg-surface-3'}`}>
          <Icon className={`w-5 h-5 ${enabled ? 'text-accent-fg' : 'text-ink-3'}`} />
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
          enabled ? 'bg-success-soft text-success' : 'bg-surface-2 text-ink-3'
        }`}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="text-xs text-ink-3 mt-1 font-mono">
        {enabled ? (facilityId || 'ID pending…') : '—'}
      </p>
    </div>
  )
}

export default function VendorDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const { data: vendorRes, error: vendorFetchError, isLoading: loading, mutate: refetchVendor } = useSWR(
    id ? `/api/vendors/${id}` : null
  )
  const vendor: VendorData | null = vendorRes?.success ? vendorRes.data : null
  const error: string | null = vendorFetchError
    ? (vendorFetchError instanceof Error ? vendorFetchError.message : 'Something went wrong')
    : (vendorRes && vendorRes.success === false ? (vendorRes.message || vendorRes.error || 'Failed to load vendor') : null)

  const { data: staffRes, isLoading: staffLoading, mutate: refetchStaff } = useSWR(
    id ? `/api/admin/vendor-staff?vendorId=${id}` : null
  )
  const staff: StaffMember[] = staffRes?.success ? (staffRes.staff || []) : []

  const { data: meData } = useSWR('/api/auth/me')
  const isSuperAdmin = !!meData?.user?.isSuperAdmin
  // AN Group's own platform business (isPlatform: true) is never a real
  // tenant a vendor can belong to -- excluded here the same way the
  // onboarding picker in console/admin/vendors/page.tsx now is, so this
  // "fix a wrong assignment" control can't be used to make the same
  // mistake it exists to correct.
  const businessOptions: { _id: string; name: string; brandName?: string; isPlatform?: boolean }[] =
    (meData?.businesses || []).filter((b: any) => !b.isPlatform)
  const [businessPicker, setBusinessPicker] = useState(false)
  const [businessPickerValue, setBusinessPickerValue] = useState('')
  const [businessSaving, setBusinessSaving] = useState(false)
  const [businessError, setBusinessError] = useState<string | null>(null)

  const [showAddStaff, setShowAddStaff] = useState(false)
  const [staffUsername, setStaffUsername] = useState('')
  const [staffRoleInput, setStaffRoleInput] = useState('')
  const [addingStaff, setAddingStaff] = useState(false)
  const [staffError, setStaffError] = useState<string | null>(null)

  // Manual trigger for the instant-trial activation path -- for a pending
  // application that should get instant-trial treatment right now even
  // though the automatic trigger (skip-approval on apply) didn't fire.
  const [activatingTrial, setActivatingTrial] = useState(false)
  const [trialActivationResult, setTrialActivationResult] = useState<{ vendorId: string | null; email: string; temporaryPassword: string | null } | null>(null)
  const [trialActivationError, setTrialActivationError] = useState<string | null>(null)

  // Owner (VendorProfile.userId) and Manager (a real VENDOR_MANAGER role
  // grant, not just the cosmetic vendorRole label "Add Staff Member" sets)
  // -- both search-and-assign against the same existing-user search
  // /api/admin/users/page.tsx already uses, since there was previously no
  // way at all to designate/change either from this page.
  const [ownerPicker, setOwnerPicker] = useState(false)
  const [ownerSearch, setOwnerSearch] = useState('')
  const [ownerResults, setOwnerResults] = useState<UserSearchResult[]>([])
  const [ownerSearching, setOwnerSearching] = useState(false)
  const [ownerSaving, setOwnerSaving] = useState(false)
  const [ownerError, setOwnerError] = useState<string | null>(null)

  const [managerPicker, setManagerPicker] = useState(false)
  const [managerSearch, setManagerSearch] = useState('')
  const [managerResults, setManagerResults] = useState<UserSearchResult[]>([])
  const [managerSearching, setManagerSearching] = useState(false)
  const [managerSaving, setManagerSaving] = useState(false)
  const [managerError, setManagerError] = useState<string | null>(null)
  const [managerSuccess, setManagerSuccess] = useState<string | null>(null)

  const [savingCategories, setSavingCategories] = useState(false)

  async function toggleProductCategory(cat: DeviceCategory) {
    if (!vendor) return
    const current = vendor.productCategories || []
    const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat]
    setSavingCategories(true)
    try {
      await refetchVendor(
        async (curr: any) => {
          const res = await fetch(`/api/vendors/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productCategories: next }),
          })
          const data = await res.json()
          if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Failed to save')
          return curr
        },
        {
          optimisticData: (curr: any) => (curr ? { ...curr, data: { ...curr.data, productCategories: next } } : curr),
          rollbackOnError: true,
          revalidate: false,
        }
      )
    } catch {
      /* rollback handled by SWR optimisticData/rollbackOnError */
    } finally {
      setSavingCategories(false)
    }
  }

  async function handleActivateTrial() {
    setActivatingTrial(true)
    setTrialActivationError(null)
    setTrialActivationResult(null)
    try {
      const res = await fetch(`/api/vendors/${id}/activate-trial`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        setTrialActivationError(data.error || 'Activation failed')
        return
      }
      setTrialActivationResult({ vendorId: data.login.vendorId, email: data.login.email, temporaryPassword: data.login.temporaryPassword })
      await refetchVendor()
    } catch (err) {
      setTrialActivationError(err instanceof Error ? err.message : 'Activation failed')
    } finally {
      setActivatingTrial(false)
    }
  }

  async function handleAddStaff() {
    if (!staffUsername.trim() || !staffRoleInput.trim()) {
      setStaffError('Enter both a user ID and a role')
      return
    }
    setAddingStaff(true)
    setStaffError(null)
    try {
      const res = await fetch('/api/admin/vendor-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: staffUsername.trim(), vendorId: id, vendorRole: staffRoleInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to add staff member')
      setStaffUsername('')
      setStaffRoleInput('')
      setShowAddStaff(false)
      refetchStaff()
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setAddingStaff(false)
    }
  }

  async function searchUsers(q: string, setResults: (u: UserSearchResult[]) => void, setSearching: (b: boolean) => void) {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q.trim())}&limit=10`)
      const data = await res.json()
      setResults(data.users || [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  async function assignOwner(user: UserSearchResult) {
    setOwnerSaving(true)
    setOwnerError(null)
    try {
      const res = await fetch(`/api/vendors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user._id }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Failed to assign owner')
      refetchVendor()
      setOwnerPicker(false)
      setOwnerSearch('')
      setOwnerResults([])
    } catch (err) {
      setOwnerError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setOwnerSaving(false)
    }
  }

  // Grants the REAL VENDOR_MANAGER role (a UserRole grant, resolved by
  // resolveOwnerOrManagerVendor same as the structural Owner) via the same
  // /promote endpoint admin/users/page.tsx's "Attach to Vendor Team" flow
  // already uses -- businessId/vendorId are already known from this page's
  // own context, so no picker is needed for those, only the target user.
  async function assignManager(user: UserSearchResult) {
    if (!vendor?.businessId) { setManagerError('This vendor has no business assigned yet'); return }
    const businessId = typeof vendor.businessId === 'string' ? vendor.businessId : vendor.businessId._id
    setManagerSaving(true)
    setManagerError(null)
    setManagerSuccess(null)
    try {
      const res = await fetch(`/api/admin/users/${user._id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track: 'VENDOR_TEAM', businessId, vendorId: id, roleCode: 'VENDOR_MANAGER' }),
      })
      const data = await res.json()
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || 'Failed to assign manager')
      setManagerSuccess(`${user.name || user.email || 'User'} is now a Manager.`)
      setManagerPicker(false)
      setManagerSearch('')
      setManagerResults([])
      refetchStaff()
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setManagerSaving(false)
    }
  }

  async function reassignBusiness() {
    if (!businessPickerValue) { setBusinessError('Pick a business'); return }
    setBusinessSaving(true)
    setBusinessError(null)
    try {
      const res = await fetch(`/api/vendors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: businessPickerValue }),
      })
      const data = await res.json()
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || 'Failed to reassign business')
      setBusinessPicker(false)
      setBusinessPickerValue('')
      refetchVendor()
    } catch (err) {
      setBusinessError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusinessSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center">
        <LoadingPanel label="Loading…" />
      </div>
    )
  }

  if (error || !vendor) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-danger mb-4">{error || 'Vendor not found'}</p>
          <button
            onClick={() => router.push('/console/admin/vendors')}
            className="px-4 py-2 rounded-card border border-border bg-surface text-sm text-ink-2 hover:bg-surface-2 transition"
          >
            Back to Vendors
          </button>
        </div>
      </div>
    )
  }

  const isApproved = vendor.isApproved || vendor.status === 'APPROVED'
  const statusKey = isApproved ? 'APPROVED' : (vendor.status ?? 'PENDING')
  const rowCls = 'flex justify-between py-2.5 border-b border-border last:border-0'
  const labelCls = 'text-xs text-ink-3'
  const valueCls = 'text-sm text-ink font-medium'

  return (
    <div className="min-h-screen bg-surface-2 text-ink">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <button
            onClick={() => router.push('/console/admin/vendors')}
            className="w-9 h-9 rounded-card border border-border bg-surface flex items-center justify-center hover:bg-surface-2 transition shrink-0 mt-1"
          >
            <ArrowLeft className="w-4 h-4 text-ink-2" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-ink">{vendor.companyName}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[statusKey] ?? 'bg-surface-2 text-ink-3'}`}>
                {statusKey}
              </span>
            </div>
            <p className="text-sm text-ink-3 mt-1 font-mono flex items-center gap-2 flex-wrap">
              {vendor.vendorId || 'No vendor ID assigned yet'} · {businessLabel(vendor.businessId)}
              {isSuperAdmin && !businessPicker && (
                <button
                  onClick={() => setBusinessPicker(true)}
                  className="text-xs font-sans text-accent hover:text-accent underline"
                >
                  Reassign business
                </button>
              )}
            </p>
            {isSuperAdmin && businessPicker && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <select
                  value={businessPickerValue}
                  onChange={(e) => setBusinessPickerValue(e.target.value)}
                  className="rounded-control border border-border px-3 py-1.5 text-sm"
                >
                  <option value="">Select the vendor's real business…</option>
                  {businessOptions.map((b) => (
                    <option key={b._id} value={b._id}>{b.brandName || b.name}</option>
                  ))}
                </select>
                <button
                  onClick={reassignBusiness}
                  disabled={businessSaving}
                  className="px-3 py-1.5 rounded-control bg-accent text-accent-fg text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  {businessSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setBusinessPicker(false); setBusinessError(null) }}
                  className="text-xs text-ink-3 hover:text-ink-2"
                >
                  Cancel
                </button>
                {businessError && <span className="text-xs text-danger">{businessError}</span>}
              </div>
            )}
          </div>
          {!isApproved && vendor.status !== 'ACTIVE' && (
            <button
              onClick={handleActivateTrial}
              disabled={activatingTrial}
              className="px-4 py-2 rounded-card bg-success text-accent-fg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition shrink-0"
            >
              {activatingTrial ? 'Activating…' : 'Activate on Trial'}
            </button>
          )}
          <button
            onClick={() => router.push(`/console/admin/vendors/${id}/coverage`)}
            className="px-4 py-2 rounded-card border border-border bg-surface text-sm text-ink-2 hover:bg-surface-2 transition shrink-0"
          >
            Service Area Coverage
          </button>
          <button
            onClick={() => router.push(`/console/admin/vendors/${id}/telegram`)}
            className="px-4 py-2 rounded-card border border-border bg-surface text-sm text-ink-2 hover:bg-surface-2 transition shrink-0"
          >
            Telegram Alerts
          </button>
        </div>

        {trialActivationResult && (
          <div className="mb-6 rounded-card border border-success bg-success-soft px-4 py-3 text-sm text-success">
            <p className="font-semibold">Vendor activated on a 7-day trial.</p>
            <p className="mt-1">
              Login (Vendor ID): <span className="font-mono">{trialActivationResult.vendorId || trialActivationResult.email}</span>
              {trialActivationResult.temporaryPassword && (
                <> &nbsp;•&nbsp; Temp password: <span className="font-mono">{trialActivationResult.temporaryPassword}</span> (shown once — share it securely now)</>
              )}
            </p>
          </div>
        )}
        {trialActivationError && (
          <div className="mb-6 rounded-card border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
            {trialActivationError}
          </div>
        )}

        {/* Owner (VendorProfile.userId, structural) and Manager (a real
            VENDOR_MANAGER role grant) -- previously neither was settable
            or even visible from this page at all. */}
        <section className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Owner</h2>
              {isSuperAdmin && !ownerPicker && (
                <button
                  onClick={() => { setOwnerPicker(true); setOwnerError(null) }}
                  className="text-[11px] font-medium text-accent hover:underline"
                >
                  {vendor.userId ? 'Change' : 'Assign'}
                </button>
              )}
            </div>
            {vendor.userId ? (
              <>
                <p className="text-sm font-medium text-ink truncate">{vendor.userId.name || vendor.userId.username || 'Unknown'}</p>
                <p className="text-xs text-ink-3 truncate">{vendor.userId.email}</p>
              </>
            ) : (
              <p className="text-sm text-ink-3">No owner assigned yet</p>
            )}
            {ownerPicker && (
              <UserSearchPicker
                search={ownerSearch}
                onSearchChange={(q) => { setOwnerSearch(q); searchUsers(q, setOwnerResults, setOwnerSearching) }}
                results={ownerResults}
                searching={ownerSearching}
                saving={ownerSaving}
                error={ownerError}
                onPick={assignOwner}
                onCancel={() => { setOwnerPicker(false); setOwnerSearch(''); setOwnerResults([]); setOwnerError(null) }}
              />
            )}
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Add a Manager</h2>
              {isSuperAdmin && !managerPicker && (
                <button
                  onClick={() => { setManagerPicker(true); setManagerError(null); setManagerSuccess(null) }}
                  className="text-[11px] font-medium text-accent hover:underline"
                >
                  Assign
                </button>
              )}
            </div>
            <p className="text-sm text-ink-3">
              Grants full Manager-level vendor access -- see the Staff list for everyone already on this vendor's team.
            </p>
            {managerSuccess && <p className="mt-2 text-xs text-success">{managerSuccess}</p>}
            {managerPicker && (
              <UserSearchPicker
                search={managerSearch}
                onSearchChange={(q) => { setManagerSearch(q); searchUsers(q, setManagerResults, setManagerSearching) }}
                results={managerResults}
                searching={managerSearching}
                saving={managerSaving}
                error={managerError}
                onPick={assignManager}
                onCancel={() => { setManagerPicker(false); setManagerSearch(''); setManagerResults([]); setManagerError(null) }}
              />
            )}
          </div>
        </section>

        {/* Facility IDs — the headline ask: show where StoreFront/Warehouse
            were enabled and what real, generated ID each got. */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-3">Facilities</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FacilityCard icon={Store} label="Store Front" enabled={vendor.enableStoreFront} facilityId={vendor.storeFrontId} />
            <FacilityCard icon={Wrench} label="Service Center" enabled={vendor.enableServiceCenter} facilityId={vendor.serviceCenterId} />
            <FacilityCard icon={Warehouse} label="Warehouse" enabled={vendor.enableWarehouse} facilityId={vendor.warehouseFacilityId} />
          </div>
        </section>

        {/* Product Categories — which electronics device types this vendor
            services, per explicit direction ("add an option in Vendor
            Settings page which is for which type of products in all
            electronics types vendor is going to handle then we can add
            those fault, symptom and solutions sections"). Same taxonomy as
            Brand.category / FaultCode-SymptomCode.deviceCategory. */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Product Categories Serviced
            </h2>
            {savingCategories && <Spinner size={12} />}
          </div>
          <div className="rounded-card border border-border bg-surface p-5 flex flex-wrap gap-2">
            {DEVICE_CATEGORIES.map((cat) => {
              const active = (vendor.productCategories || []).includes(cat)
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleProductCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    active ? 'bg-accent text-accent-fg border-accent' : 'border-border text-ink-3 hover:border-border'
                  }`}
                >
                  {DEVICE_CATEGORY_LABELS[cat]}
                </button>
              )
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — details */}
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-card border border-border bg-surface p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-3 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Company Details
              </h2>
              <div className={rowCls}><span className={labelCls}>Contact Person</span><span className={valueCls}>{vendor.contactPerson || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Email</span><span className={valueCls}>{vendor.email || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Phone</span><span className={valueCls}>{vendor.phone || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Category</span><span className={valueCls}>{vendor.category || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Business Type</span><span className={valueCls}>{vendor.businessType || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Payment Terms</span><span className={valueCls}>{vendor.paymentTerms || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Credit Limit</span><span className={valueCls}>{vendor.creditLimit ? `₹${vendor.creditLimit.toLocaleString('en-IN')}` : '—'}</span></div>
            </section>

            <section className="rounded-card border border-border bg-surface p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-3 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Address
              </h2>
              {vendor.address && (vendor.address.street || vendor.address.city) ? (
                <p className="text-sm text-ink">
                  {[vendor.address.street, vendor.address.city, vendor.address.state, vendor.address.pincode].filter(Boolean).join(', ')}
                </p>
              ) : (
                <p className="text-sm text-ink-3">No address on file</p>
              )}
            </section>

            <section className="rounded-card border border-border bg-surface p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-3 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Compliance
              </h2>
              <div className={rowCls}><span className={labelCls}>GSTIN</span><span className={`${valueCls} font-mono`}>{vendor.gstNumber || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>PAN</span><span className={`${valueCls} font-mono`}>{vendor.panNumber || '—'}</span></div>
            </section>

            <section className="rounded-card border border-border bg-surface p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-3 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Bank Details
              </h2>
              <div className={rowCls}><span className={labelCls}>Bank</span><span className={valueCls}>{vendor.bankDetails?.bankName || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Account Number</span><span className={`${valueCls} font-mono`}>{vendor.bankDetails?.accountNumber || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>IFSC</span><span className={`${valueCls} font-mono`}>{vendor.bankDetails?.ifscCode || '—'}</span></div>
            </section>

            {vendor.documents && (vendor.documents.passbookUrl || vendor.documents.gstCertificateUrl || Object.keys(vendor.documents.compliance || {}).length > 0) && (
              <section className="rounded-card border border-border bg-surface p-6">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-3 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Documents
                </h2>
                <div className="space-y-2">
                  {vendor.documents.passbookUrl && (
                    <a href={vendor.documents.passbookUrl} target="_blank" rel="noreferrer" className="block text-sm text-accent hover:underline">Bank Passbook / Cancelled Cheque</a>
                  )}
                  {vendor.documents.gstCertificateUrl && (
                    <a href={vendor.documents.gstCertificateUrl} target="_blank" rel="noreferrer" className="block text-sm text-accent hover:underline">GST Certificate</a>
                  )}
                  {Object.entries(vendor.documents.compliance || {}).map(([key, doc]) => (
                    doc.url ? (
                      <a key={key} href={doc.url} target="_blank" rel="noreferrer" className="block text-sm text-accent hover:underline">
                        {doc.label || key.replace(/_/g, ' ')}
                      </a>
                    ) : null
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right column — staff roster */}
          <div className="space-y-6">
            <section className="rounded-card border border-border bg-surface p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Staff ({staff.length})
                </h2>
                {isSuperAdmin && (
                  <button
                    onClick={() => setShowAddStaff((s) => !s)}
                    className="w-6 h-6 rounded-control border border-border flex items-center justify-center hover:bg-surface-2 transition"
                  >
                    {showAddStaff ? <X className="w-3.5 h-3.5 text-ink-3" /> : <Plus className="w-3.5 h-3.5 text-ink-3" />}
                  </button>
                )}
              </div>

              {showAddStaff && (
                <div className="mb-4 rounded-card border border-border p-3 space-y-2">
                  {staffError && <p className="text-xs text-danger">{staffError}</p>}
                  <input
                    value={staffUsername}
                    onChange={(e) => setStaffUsername(e.target.value)}
                    placeholder="User ID"
                    className="w-full bg-surface border border-border rounded-control px-3 py-2 text-xs text-ink placeholder-ink-3 outline-none focus:border-border-strong transition"
                  />
                  <input
                    value={staffRoleInput}
                    onChange={(e) => setStaffRoleInput(e.target.value)}
                    placeholder="Role (e.g. Warehouse Manager)"
                    className="w-full bg-surface border border-border rounded-control px-3 py-2 text-xs text-ink placeholder-ink-3 outline-none focus:border-border-strong transition"
                  />
                  <button
                    onClick={handleAddStaff}
                    disabled={addingStaff}
                    className="w-full py-2 rounded-control bg-accent text-accent-fg text-xs font-medium hover:bg-accent-hover transition disabled:opacity-50"
                  >
                    {addingStaff ? 'Adding…' : 'Add Staff Member'}
                  </button>
                </div>
              )}

              {staffLoading ? (
                <div className="flex justify-center py-6"><Spinner size={20} /></div>
              ) : staff.length === 0 ? (
                <p className="text-sm text-ink-3 text-center py-6">No staff added yet</p>
              ) : (
                <div className="space-y-2">
                  {staff.map((s) => (
                    <div key={s._id} className="rounded-card border border-border px-3 py-2.5">
                      <p className="text-sm font-medium text-ink truncate">
                        {s.userId?.name || s.userId?.username || s.userId?.email || 'Unknown user'}
                      </p>
                      <p className="text-xs text-ink-3 truncate">{s.userId?.email}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {s.vendorRole && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-2 text-ink-2">{s.vendorRole}</span>
                        )}
                        {s.memberType && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent-soft text-accent">{s.memberType}</span>
                        )}
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          s.status === 'ACTIVE' ? 'bg-success-soft text-success' : 'bg-surface-2 text-ink-3'
                        }`}>
                          {s.status || 'ACTIVE'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
