'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import {
  Building2,
  AlertCircle,
  Save,
  CheckCircle,
  Star,
  ShieldCheck,
  Clock,
} from 'lucide-react'
import { validateGSTIN } from '@/lib/validation/gst'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'

interface VendorProfileData {
  _id: string
  vendorId: string
  companyName: string
  contactPerson: string
  email: string
  phone: string
  gstNumber: string
  panNumber: string
  category: string
  termsAndConditions?: string
  address: {
    street: string
    city: string
    state: string
    pincode: string
  }
  bankDetails: {
    accountName: string
    accountNumber: string
    ifscCode: string
    bankName: string
  }
  isApproved: boolean
  rating: number
  createdAt: string
  servicePincodes?: string[]
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= Math.round(rating)
              ? 'text-warning fill-warning'
              : 'text-ink-3'
          }`}
        />
      ))}
      <span className="text-sm text-ink-2 ml-1">{rating.toFixed(1)}</span>
    </div>
  )
}

function FormField({
  label,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  readOnly,
  type = 'text',
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  onBlur?: () => void
  error?: string
  placeholder?: string
  readOnly?: boolean
  type?: string
}) {
  return (
    <Field label={label} error={error}>
      <Input
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        onBlur={onBlur}
        placeholder={placeholder}
        readOnly={readOnly}
        className={readOnly ? 'opacity-60 cursor-not-allowed' : ''}
      />
    </Field>
  )
}

export default function VendorProfilePage() {
  const [profile, setProfile] = useState<VendorProfileData | null>(null)
  const [saving, setSaving] = useState(false)
  const [gstError, setGstError] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Business-level settings only an Owner or Manager can see/change --
  // GET 403s for any other staff role, so canManageSettings just stays
  // false and the section below never renders for them.
  const [canManageSettings, setCanManageSettings] = useState(false)
  const [inventorySerialized, setInventorySerialized] = useState(false)
  // Whether GST/tax is applied on a plain B2C bill (customer with no
  // company name) at job-sheet close -- default true (existing behaviour).
  // B2B invoices (company name present) always carry tax regardless.
  const [applyTaxOnB2CBilling, setApplyTaxOnB2CBilling] = useState(true)
  const [termsAndConditions, setTermsAndConditions] = useState('')
  // Per-document-type T&C -- fixes "Should be separate per page type not
  // same for all" (was one unified field shown on every document type).
  const [workorderTerms, setWorkorderTerms] = useState('')
  const [serviceOrderTerms, setServiceOrderTerms] = useState('')
  const [estimateTerms, setEstimateTerms] = useState('')
  const [invoiceTerms, setInvoiceTerms] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')
  // Default Labour Charge -- fallback rate for the workorder page's "Add
  // Labour Charge" line, per explicit direction ("Add Labour charge key
  // must add charges set by manager or owner"). Owner/Manager only, same
  // section as the rest of Business Settings.
  const [defaultLabourCharge, setDefaultLabourCharge] = useState('0')
  const [savingLabourCharge, setSavingLabourCharge] = useState(false)
  // UPI ID -- this vendor's own payment VPA for the QR shown on their
  // invoices (see api/sales/invoices/[id]/upi-qr/route.ts). Per-vendor,
  // not the shared platform Business's -- every self-signed-up vendor
  // used to see/inherit whichever ONE UPI ID any vendor last saved.
  const [upiId, setUpiId] = useState('')
  const [savingUpiId, setSavingUpiId] = useState(false)
  // Customer Logo -- shown on the Intake Receipt/Workorder print in place
  // of the device brand's own logo/name, per explicit direction (that
  // document should never show the device manufacturer's branding).
  // Blank = no logo prints at all.
  const [customerLogoUrl, setCustomerLogoUrl] = useState('')
  const [savingCustomerLogo, setSavingCustomerLogo] = useState(false)
  // This vendor's own brand logo -- shown in the vendor-portal sidebar and
  // preferred over the shared platform Business's logo on printed
  // documents. Distinct from Customer Logo above.
  const [logoUrl, setLogoUrl] = useState('')
  const [savingLogo, setSavingLogo] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  // Signature -- shown in the "Service Centre Signatory" slot on printed
  // Invoice/Workorder/Service Record documents. Blank = no signature
  // image prints; the document shows a digital-document notice instead.
  const [documentSignatureUrl, setDocumentSignatureUrl] = useState('')
  const [savingSignature, setSavingSignature] = useState(false)
  // Service Record settings -- printed on the document generated after
  // closing a job sheet (see /vendor/crm/jobsheets/[id]/service-record).
  // Owner/Manager only, same as the rest of this section.
  const [serviceHours, setServiceHours] = useState('')
  const [serviceHotline, setServiceHotline] = useState('')
  const [savingServiceRecord, setSavingServiceRecord] = useState(false)
  const [serviceRecordMessage, setServiceRecordMessage] = useState('')

  // Team & Access -- every user Super Admin (or the vendor) attached to
  // this vendor, with per-module access checkboxes the Owner/Manager
  // controls directly ("vendor can give either single access to user or
  // multiple access"). Backed by /api/vendor/team.
  interface TeamMember { userId: string; name?: string; email?: string; username?: string; isOwner: boolean; isManager: boolean; modules: string[] }
  interface AccessModule { key: string; label: string; description?: string }
  const [team, setTeam] = useState<TeamMember[]>([])
  const [availableModules, setAvailableModules] = useState<AccessModule[]>([])
  const [teamSaving, setTeamSaving] = useState<string | null>(null)
  const [teamMessage, setTeamMessage] = useState('')

  const { data: teamData, mutate: refetchTeam } = useSWR('/api/vendor/team')
  useEffect(() => {
    if (teamData?.success) {
      setTeam(teamData.team || [])
      setAvailableModules(teamData.availableModules || [])
    }
  }, [teamData])

  const { data: settingsData } = useSWR('/api/vendor/settings')
  useEffect(() => {
    if (settingsData?.success) {
      setCanManageSettings(true)
      setInventorySerialized(Boolean(settingsData.inventorySerialized))
      setApplyTaxOnB2CBilling(settingsData.applyTaxOnB2CBilling !== false)
      setTermsAndConditions(settingsData.termsAndConditions || '')
      setWorkorderTerms(settingsData.workorderTerms || '')
      setServiceOrderTerms(settingsData.serviceOrderTerms || '')
      setEstimateTerms(settingsData.estimateTerms || '')
      setInvoiceTerms(settingsData.invoiceTerms || '')
      setDefaultLabourCharge(String(settingsData.defaultLabourCharge ?? 0))
      setCustomerLogoUrl(settingsData.customerLogoUrl || '')
      setLogoUrl(settingsData.logoUrl || '')
      setDocumentSignatureUrl(settingsData.documentSignatureUrl || '')
      setUpiId(settingsData.upiId || '')
    }
  }, [settingsData])

  function toggleMemberModule(userId: string, moduleKey: string) {
    setTeam((prev) => prev.map((m) => {
      if (m.userId !== userId) return m
      const has = m.modules.includes(moduleKey)
      return { ...m, modules: has ? m.modules.filter((k) => k !== moduleKey) : [...m.modules, moduleKey] }
    }))
  }

  async function saveMemberAccess(member: TeamMember) {
    setTeamSaving(member.userId)
    setTeamMessage('')
    try {
      const res = await fetch('/api/vendor/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.userId, modules: member.modules, isManager: member.isManager }),
      })
      const d = await res.json()
      setTeamMessage(d.success ? `Saved access for ${member.name || member.email}.` : d.error || 'Failed to save.')
      if (d.success) refetchTeam()
    } catch {
      setTeamMessage('Failed to save.')
    } finally {
      setTeamSaving(null)
    }
  }

  async function saveInventorySetting(value: boolean) {
    setSavingSettings(true)
    setSettingsMessage('')
    try {
      const res = await fetch('/api/vendor/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventorySerialized: value }),
      })
      const d = await res.json()
      if (d.success) {
        setInventorySerialized(value)
        setSettingsMessage('Saved.')
      } else {
        setSettingsMessage(d.error || 'Failed to save.')
      }
    } catch {
      setSettingsMessage('Failed to save.')
    } finally {
      setSavingSettings(false)
    }
  }

  async function saveTaxOnB2CBilling(value: boolean) {
    setSavingSettings(true)
    setSettingsMessage('')
    try {
      const res = await fetch('/api/vendor/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applyTaxOnB2CBilling: value }),
      })
      const d = await res.json()
      if (d.success) {
        setApplyTaxOnB2CBilling(value)
        setSettingsMessage('Saved.')
      } else {
        setSettingsMessage(d.error || 'Failed to save.')
      }
    } catch {
      setSettingsMessage('Failed to save.')
    } finally {
      setSavingSettings(false)
    }
  }

  async function saveLabourCharge() {
    const value = parseFloat(defaultLabourCharge) || 0
    setSavingLabourCharge(true)
    setSettingsMessage('')
    try {
      const res = await fetch('/api/vendor/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultLabourCharge: value }),
      })
      const d = await res.json()
      setSettingsMessage(d.success ? 'Saved.' : d.error || 'Failed to save.')
    } catch {
      setSettingsMessage('Failed to save.')
    } finally {
      setSavingLabourCharge(false)
    }
  }

  async function saveUpiId() {
    setSavingUpiId(true)
    setSettingsMessage('')
    try {
      const res = await fetch('/api/vendor/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upiId }),
      })
      const d = await res.json()
      setSettingsMessage(d.success ? 'Saved.' : d.error || 'Failed to save.')
    } catch {
      setSettingsMessage('Failed to save.')
    } finally {
      setSavingUpiId(false)
    }
  }

  async function saveLogo(url?: string) {
    setSavingLogo(true)
    setSettingsMessage('')
    try {
      const res = await fetch('/api/vendor/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: url ?? logoUrl }),
      })
      const d = await res.json()
      setSettingsMessage(d.success ? 'Saved.' : d.error || 'Failed to save.')
    } catch {
      setSettingsMessage('Failed to save.')
    } finally {
      setSavingLogo(false)
    }
  }

  async function handleLogoUpload(file: File) {
    setUploadingLogo(true)
    setSettingsMessage('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', 'vendor-logo')
      fd.append('category', 'logo')
      const res = await fetch('/api/assets/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || data.message || 'Failed to upload logo')
      const uploadedUrl = data.asset?.fileUrl || ''
      setLogoUrl(uploadedUrl)
      await saveLogo(uploadedUrl)
    } catch (err: any) {
      setSettingsMessage(err?.message || 'Failed to upload logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function saveCustomerLogo() {
    setSavingCustomerLogo(true)
    setSettingsMessage('')
    try {
      const res = await fetch('/api/vendor/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerLogoUrl }),
      })
      const d = await res.json()
      setSettingsMessage(d.success ? 'Saved.' : d.error || 'Failed to save.')
    } catch {
      setSettingsMessage('Failed to save.')
    } finally {
      setSavingCustomerLogo(false)
    }
  }

  async function saveDocumentSignature() {
    setSavingSignature(true)
    setSettingsMessage('')
    try {
      const res = await fetch('/api/vendor/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentSignatureUrl }),
      })
      const d = await res.json()
      setSettingsMessage(d.success ? 'Saved.' : d.error || 'Failed to save.')
    } catch {
      setSettingsMessage('Failed to save.')
    } finally {
      setSavingSignature(false)
    }
  }

  // Per-document-type Terms & Conditions -- workorderTerms is the general
  // fallback (used when a specific document type has none of its own
  // set); serviceOrderTerms/estimateTerms/invoiceTerms each print only on
  // their own document type. Saved together, own button, same as before.
  async function saveTerms() {
    setSavingSettings(true)
    setSettingsMessage('')
    try {
      const res = await fetch('/api/vendor/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termsAndConditions, workorderTerms, serviceOrderTerms, estimateTerms, invoiceTerms }),
      })
      const d = await res.json()
      setSettingsMessage(d.success ? 'Saved.' : d.error || 'Failed to save.')
    } catch {
      setSettingsMessage('Failed to save.')
    } finally {
      setSavingSettings(false)
    }
  }

  const [form, setForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    gstNumber: '',
    panNumber: '',
    category: '',
    termsAndConditions: '',
    address: { street: '', city: '', state: '', pincode: '' },
    bankDetails: {
      accountName: '',
      accountNumber: '',
      ifscCode: '',
      bankName: '',
    },
    servicePincodes: [] as string[],
  })

  const [pincodeInput, setPincodeInput] = useState('')
  const [pincodeWarning, setPincodeWarning] = useState('')

  const { data: profileRes, isLoading: loading, mutate: refetchProfile } = useSWR('/api/vendor/profile')
  useEffect(() => {
    if (!profileRes) return
    if (profileRes.success && profileRes.data) {
      const p = profileRes.data
      setProfile(p)
      setForm({
        companyName: p.companyName || '',
        contactPerson: p.contactPerson || '',
        phone: p.phone || '',
        gstNumber: p.gstNumber || '',
        panNumber: p.panNumber || '',
        category: p.category || '',
        termsAndConditions: p.termsAndConditions || '',
        address: {
          street: p.address?.street || '',
          city: p.address?.city || '',
          state: p.address?.state || '',
          pincode: p.address?.pincode || '',
        },
        bankDetails: {
          accountName: p.bankDetails?.accountName || '',
          accountNumber: p.bankDetails?.accountNumber || '',
          ifscCode: p.bankDetails?.ifscCode || '',
          bankName: p.bankDetails?.bankName || '',
        },
        servicePincodes: Array.isArray(p.servicePincodes) ? p.servicePincodes : [],
      })
      setServiceHours(p.serviceCenterInfo?.hours || '')
      setServiceHotline(p.serviceCenterInfo?.hotline || '')
    } else {
      setError(profileRes.message || 'Failed to load profile')
    }
  }, [profileRes])

  async function saveServiceRecordInfo() {
    setSavingServiceRecord(true)
    setServiceRecordMessage('')
    try {
      const res = await fetch('/api/vendor/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceCenterInfo: { hours: serviceHours, hotline: serviceHotline } }),
      })
      const d = await res.json()
      setServiceRecordMessage(d.success ? 'Saved.' : d.message || 'Failed to save.')
      if (d.success) refetchProfile()
    } catch {
      setServiceRecordMessage('Failed to save.')
    } finally {
      setSavingServiceRecord(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/vendor/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (json.success) {
        setSuccess('Profile updated successfully')
        setTimeout(() => setSuccess(''), 3000)
        refetchProfile()
      } else {
        setError(json.message || 'Failed to save')
      }
    } catch {
      setError('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const setAddr = (field: string, value: string) => {
    setForm((f) => ({ ...f, address: { ...f.address, [field]: value } }))
  }

  const setBank = (field: string, value: string) => {
    setForm((f) => ({
      ...f,
      bankDetails: { ...f.bankDetails, [field]: value },
    }))
  }

  const addServicePincode = async () => {
    const pin = pincodeInput.trim()
    setPincodeWarning('')
    if (!/^[1-9][0-9]{5}$/.test(pin)) {
      setPincodeWarning('Enter a valid 6-digit pincode')
      return
    }
    if (form.servicePincodes.includes(pin)) {
      setPincodeInput('')
      return
    }
    try {
      const res = await fetch(`/api/pincode/${pin}`)
      const json = await res.json()
      if (json.success && json.found === false) {
        setPincodeWarning(`${pin} not found in pincode master data — added anyway, please double-check`)
      }
    } catch {
      // Lookup failing shouldn't block adding the pincode.
    }
    setForm((f) => ({ ...f, servicePincodes: [...f.servicePincodes, pin] }))
    setPincodeInput('')
  }

  const removeServicePincode = (pin: string) => {
    setForm((f) => ({ ...f, servicePincodes: f.servicePincodes.filter((p) => p !== pin) }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <PageHeader eyebrow="Vendor Portal" title="My Profile" />

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-control bg-success-soft border border-success/20 text-success text-sm">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Read-only info banner */}
      {profile && (
        <Card className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-1">
                Vendor ID
              </p>
              <p className="text-sm font-mono text-ink-2">
                {profile.vendorId}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-1">
                Member Since
              </p>
              <p className="text-sm text-ink-2">
                {new Date(profile.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-1">
                Rating
              </p>
              <StarRating rating={profile.rating || 0} />
            </div>
            <div>
              <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-1">
                Status
              </p>
              {profile.isApproved ? (
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  <Badge tone="success">Approved</Badge>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-warning" />
                  <Badge tone="warning">Pending Review</Badge>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Company Information */}
      <Card className="p-5">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-control bg-accent-soft border border-accent/20 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">
              Company Information
            </h2>
            <p className="text-xs text-ink-3">
              Basic business details
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Company Name"
            value={form.companyName}
            onChange={(v) => setForm((f) => ({ ...f, companyName: v }))}
            placeholder="Your company name"
          />
          <FormField
            label="Contact Person"
            value={form.contactPerson}
            onChange={(v) => setForm((f) => ({ ...f, contactPerson: v }))}
            placeholder="Primary contact name"
          />
          <FormField
            label="Email Address"
            value={profile?.email || ''}
            readOnly
            type="email"
          />
          <FormField
            label="Phone Number"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            placeholder="+91 98765 43210"
            type="tel"
          />
          <FormField
            label="GST Number"
            value={form.gstNumber}
            onChange={(v) => { setForm((f) => ({ ...f, gstNumber: v })); setGstError('') }}
            onBlur={() => {
              if (!form.gstNumber.trim()) { setGstError(''); return }
              const result = validateGSTIN(form.gstNumber)
              setGstError(result.valid ? '' : result.reason || 'Invalid GSTIN')
            }}
            error={gstError}
            placeholder="22AAAAA0000A1Z5"
          />
          <FormField
            label="PAN Number"
            value={form.panNumber}
            onChange={(v) => setForm((f) => ({ ...f, panNumber: v }))}
            placeholder="AAAAA0000A"
          />
          <div className="md:col-span-2">
            <Field label="Business Category">
              <Select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
              >
                <option value="">Select category</option>
                <option value="MANUFACTURING">Manufacturing</option>
                <option value="TRADING">Trading</option>
                <option value="SERVICES">Services</option>
                <option value="LOGISTICS">Logistics</option>
                <option value="TECHNOLOGY">Technology</option>
                <option value="RETAIL">Retail</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Service Terms & Conditions">
              <Textarea
                rows={5}
                value={form.termsAndConditions}
                onChange={(e) =>
                  setForm((f) => ({ ...f, termsAndConditions: e.target.value }))
                }
                placeholder="Your own service terms and conditions -- shown on your workorder documents"
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* Address */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink mb-5">
          Business Address
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <FormField
              label="Street Address"
              value={form.address.street}
              onChange={(v) => setAddr('street', v)}
              placeholder="Street / Plot / Area"
            />
          </div>
          <FormField
            label="City"
            value={form.address.city}
            onChange={(v) => setAddr('city', v)}
            placeholder="City"
          />
          <FormField
            label="State"
            value={form.address.state}
            onChange={(v) => setAddr('state', v)}
            placeholder="State"
          />
          <FormField
            label="Pincode"
            value={form.address.pincode}
            onChange={(v) => setAddr('pincode', v)}
            placeholder="400001"
          />
        </div>
      </Card>

      {/* Service Pincodes */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink mb-1">Service Area Pincodes</h2>
        <p className="text-xs text-ink-3 mb-4">
          Pincodes where you can attend on-site / service-center visits. Used to route customer appointment requests to you.
        </p>
        <div className="flex gap-2 mb-2">
          <Input
            type="text"
            value={pincodeInput}
            onChange={(e) => setPincodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addServicePincode()
              }
            }}
            placeholder="Add a 6-digit pincode"
            className="flex-1"
          />
          <Button type="button" onClick={addServicePincode} variant="secondary">
            Add
          </Button>
        </div>
        {pincodeWarning && (
          <p className="text-xs text-warning mb-2">{pincodeWarning}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {form.servicePincodes.length === 0 && (
            <p className="text-xs text-ink-3">No service pincodes added yet.</p>
          )}
          {form.servicePincodes.map((pin) => (
            <span
              key={pin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-soft border border-accent/20 text-xs font-medium text-accent"
            >
              {pin}
              <button
                type="button"
                onClick={() => removeServicePincode(pin)}
                className="text-accent hover:opacity-70"
                aria-label={`Remove ${pin}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </Card>

      {/* Bank Details */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink mb-1">Bank Details</h2>
        <p className="text-xs text-ink-3 mb-5">
          Payment will be transferred to this account
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Account Holder Name"
            value={form.bankDetails.accountName}
            onChange={(v) => setBank('accountName', v)}
            placeholder="Name as per bank records"
          />
          <FormField
            label="Bank Name"
            value={form.bankDetails.bankName}
            onChange={(v) => setBank('bankName', v)}
            placeholder="State Bank of India"
          />
          <FormField
            label="Account Number"
            value={form.bankDetails.accountNumber}
            onChange={(v) => setBank('accountNumber', v)}
            placeholder="Account number"
          />
          <FormField
            label="IFSC Code"
            value={form.bankDetails.ifscCode}
            onChange={(v) => setBank('ifscCode', v.toUpperCase())}
            placeholder="SBIN0001234"
          />
        </div>
      </Card>

      {/* Business Settings -- Owner/Manager only */}
      {canManageSettings && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">Business Settings</h2>
          <p className="text-xs text-ink-3 mb-5">
            Owner/Manager only -- affects the whole business, not just your account.
          </p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={inventorySerialized}
              disabled={savingSettings}
              onChange={(e) => saveInventorySetting(e.target.checked)}
              className="w-4 h-4 mt-0.5"
            />
            <span className="text-sm text-ink-2">
              <span className="font-medium text-ink">Serialized Inventory</span> — check real stock and
              deduct on workorder close. When off, part selection just pulls from the Service Center BOM price
              list with no live stock check.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer mt-4 pt-4 border-t border-border">
            <input
              type="checkbox"
              checked={applyTaxOnB2CBilling}
              disabled={savingSettings}
              onChange={(e) => saveTaxOnB2CBilling(e.target.checked)}
              className="w-4 h-4 mt-0.5"
            />
            <span className="text-sm text-ink-2">
              <span className="font-medium text-ink">Apply Tax on B2C Billing</span> — when a customer has no
              company name, generate their Bill with GST included. Turn this off to raise B2C Bills with no tax
              at all. B2B invoices (customer has a company name) always include tax regardless of this setting.
            </span>
          </label>

          <div className="mt-5 pt-5 border-t border-border">
            <label className="block text-sm font-medium text-ink mb-1">Default Labour Charge</label>
            <p className="text-xs text-ink-3 mb-2">
              Rate used by the workorder page's "Add Labour Charge" button when this vendor has no
              Labour-type Service Center BOM entry of its own.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-3">₹</span>
              <Input
                type="number"
                min={0}
                value={defaultLabourCharge}
                onChange={(e) => setDefaultLabourCharge(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-32"
              />
              <Button onClick={saveLabourCharge} disabled={savingLabourCharge}>
                {savingLabourCharge ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-border">
            <label className="block text-sm font-medium text-ink mb-1">UPI ID</label>
            <p className="text-xs text-ink-3 mb-2">
              Payment QR shown on your invoices. Leave blank to show no QR at all.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="yourname@upi"
                className="w-64"
              />
              <Button onClick={saveUpiId} disabled={savingUpiId}>
                {savingUpiId ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-border">
            <label className="block text-sm font-medium text-ink mb-1">Business Logo</label>
            <p className="text-xs text-ink-3 mb-2">
              Shown in your vendor-portal sidebar and on printed documents (invoices/workorders) in place of the
              platform's own logo. Square image, at least 512×512px, PNG with a transparent background works best
              -- it renders small (sidebar icon) and larger (document header), so avoid a wide/landscape logo.
            </p>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Business logo preview" className="h-12 w-12 object-contain border border-border rounded-control bg-surface p-1" />
              ) : (
                <div className="h-12 w-12 rounded-control border border-dashed border-border bg-surface-2 flex items-center justify-center text-[10px] text-ink-3">None</div>
              )}
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f) }}
                />
                <span className="text-xs px-3 py-2 rounded-control border border-border cursor-pointer hover:border-accent text-ink-2 inline-flex items-center gap-1.5">
                  {uploadingLogo ? 'Uploading…' : logoUrl ? 'Replace image' : 'Upload image'}
                </span>
              </label>
              {logoUrl && (
                <button type="button" onClick={() => { setLogoUrl(''); saveLogo('') }} className="text-xs text-danger hover:underline">
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-border">
            <label className="block text-sm font-medium text-ink mb-1">Customer Logo</label>
            <p className="text-xs text-ink-3 mb-2">
              Shown on the Intake Receipt/Workorder print instead of the device brand's own logo -- that
              document never shows the manufacturer's branding. Leave blank for no logo at all.
            </p>
            <div className="flex items-center gap-3">
              {customerLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={customerLogoUrl} alt="Customer logo preview" className="h-10 w-auto max-w-[120px] object-contain border border-border rounded-control bg-surface p-1" />
              ) : (
                <div className="h-10 w-16 rounded-control border border-border bg-surface-2 flex items-center justify-center text-[10px] text-ink-3">None</div>
              )}
              <Input
                type="url"
                value={customerLogoUrl}
                onChange={(e) => setCustomerLogoUrl(e.target.value)}
                placeholder="https://…"
                className="flex-1"
              />
              <Button onClick={saveCustomerLogo} disabled={savingCustomerLogo}>
                {savingCustomerLogo ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-border">
            <label className="block text-sm font-medium text-ink mb-1">Signature</label>
            <p className="text-xs text-ink-3 mb-2">
              Shown as the Service Centre Signatory on printed Invoice/Workorder/Service Record documents.
              Leave blank to print no signature image -- the document will instead show a notice that it's
              a digital document and doesn't require a physical signature.
            </p>
            <div className="flex items-center gap-3">
              {documentSignatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={documentSignatureUrl} alt="Signature preview" className="h-10 w-auto max-w-[120px] object-contain border border-border rounded-control bg-surface p-1" />
              ) : (
                <div className="h-10 w-16 rounded-control border border-border bg-surface-2 flex items-center justify-center text-[10px] text-ink-3">None</div>
              )}
              <Input
                type="url"
                value={documentSignatureUrl}
                onChange={(e) => setDocumentSignatureUrl(e.target.value)}
                placeholder="https://…"
                className="flex-1"
              />
              <Button onClick={saveDocumentSignature} disabled={savingSignature}>
                {savingSignature ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-border space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Terms &amp; Conditions</label>
              <p className="text-xs text-ink-3 mb-2">
                Each document type below can have its own terms. Leave a specific one blank to fall back to this general one.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">General (fallback)</label>
              <Textarea
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
                rows={3}
                placeholder="e.g. Payment due within 7 days of invoice. Warranty does not cover physical/liquid damage..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Workorder</label>
              <Textarea
                value={workorderTerms}
                onChange={(e) => setWorkorderTerms(e.target.value)}
                rows={3}
                placeholder="Shown on the printed Workorder only -- leave blank to use the general terms above."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Service Record</label>
              <Textarea
                value={serviceOrderTerms}
                onChange={(e) => setServiceOrderTerms(e.target.value)}
                rows={3}
                placeholder="Shown on the printed Service Record only -- leave blank to use the general terms above."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Estimate</label>
              <Textarea
                value={estimateTerms}
                onChange={(e) => setEstimateTerms(e.target.value)}
                rows={3}
                placeholder="Shown on the printed Estimate only -- leave blank to use the general terms above."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Invoice</label>
              <Textarea
                value={invoiceTerms}
                onChange={(e) => setInvoiceTerms(e.target.value)}
                rows={3}
                placeholder="Shown on the printed Invoice only -- leave blank to use the general terms above."
              />
            </div>

            <Button onClick={saveTerms} disabled={savingSettings}>
              {savingSettings ? 'Saving…' : 'Save Terms & Conditions'}
            </Button>
          </div>

          {settingsMessage && <p className="text-xs text-ink-3 mt-2">{settingsMessage}</p>}

          <div className="mt-5 pt-5 border-t border-border">
            <label className="block text-sm font-medium text-ink mb-1">Service Record Details</label>
            <p className="text-xs text-ink-3 mb-2">
              Printed on the Service Record generated after closing a job sheet, alongside your company name/address/phone above.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                label="Service Hours"
                value={serviceHours}
                onChange={setServiceHours}
                placeholder="10:00-13:00 14:00-19:00 (Week Off: Sunday)"
              />
              <FormField
                label="Official Hotline"
                value={serviceHotline}
                onChange={setServiceHotline}
                placeholder="18001028411"
              />
            </div>
            <Button onClick={saveServiceRecordInfo} disabled={savingServiceRecord} className="mt-2">
              {savingServiceRecord ? 'Saving…' : 'Save Service Record Details'}
            </Button>
            {serviceRecordMessage && <p className="text-xs text-ink-3 mt-2">{serviceRecordMessage}</p>}
          </div>
        </Card>
      )}

      {/* Team & Access -- Owner/Manager only. Every user attached to this
          vendor (by Super Admin or the vendor), each with per-module
          access checkboxes. Access takes effect on the member's next
          page load / login. */}
      {team.length > 0 && availableModules.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">Team &amp; Access</h2>
          <p className="text-xs text-ink-3 mb-4">
            Users attached to your vendor. Tick the modules each person may use — one or many — then save.
            &quot;Manager&quot; grants full access plus the ability to manage this team.
          </p>
          {teamMessage && (
            <div className="mb-3 px-3 py-2 bg-surface-2 border border-border rounded-control text-xs text-ink-2">{teamMessage}</div>
          )}
          <div className="space-y-4">
            {team.map((member) => (
              <div key={member.userId} className="rounded-control border border-border p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {member.name || member.email}
                      {member.isOwner && <span className="ml-2 inline-block"><Badge tone="info">Owner</Badge></span>}
                      {member.isManager && !member.isOwner && <span className="ml-2 inline-block"><Badge tone="info">Manager</Badge></span>}
                    </p>
                    <p className="text-xs text-ink-3">{member.username || member.email}</p>
                  </div>
                  {!member.isOwner && (
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={member.isManager}
                          onChange={(e) => setTeam((prev) => prev.map((m) => m.userId === member.userId ? { ...m, isManager: e.target.checked } : m))}
                          className="w-3.5 h-3.5"
                        />
                        Manager
                      </label>
                      <Button
                        onClick={() => saveMemberAccess(member)}
                        disabled={teamSaving === member.userId}
                        size="sm"
                      >
                        {teamSaving === member.userId ? 'Saving…' : 'Save Access'}
                      </Button>
                    </div>
                  )}
                </div>
                {member.isOwner ? (
                  <p className="text-xs text-ink-3">The Owner always has full access to every available module.</p>
                ) : member.isManager ? (
                  <p className="text-xs text-ink-3">Managers have full access to every available module. Untick Manager to grant specific modules instead.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                    {availableModules.map((mod) => (
                      <label key={mod.key} title={mod.description} className="flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer rounded-control border border-border px-2 py-1.5 hover:border-border-strong">
                        <input
                          type="checkbox"
                          checked={member.modules.includes(mod.key)}
                          onChange={() => toggleMemberModule(member.userId, mod.key)}
                          className="w-3.5 h-3.5"
                        />
                        {mod.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Save */}
      <div className="flex justify-end pb-4">
        <Button
          onClick={handleSave}
          disabled={saving}
          icon={saving ? undefined : <Save className="h-4 w-4" />}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
