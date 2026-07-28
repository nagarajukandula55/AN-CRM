'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { validateGSTIN } from '@/lib/validation/gst'
import { StateSelect, CitySelect, PincodeInput } from '@/components/shared/LocationSelect'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from '@/core/catalog/deviceCategory'
import { DeviceCatalogFields } from '@/components/crm/DeviceCatalogFields'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

interface Brand { _id: string; name: string; parentId?: string | null; logoUrl?: string }
interface FaultCode { _id: string; code: string; description: string }
interface SymptomCode { _id: string; code: string; description: string }
interface CrmOption { _id: string; code: string; label: string }
interface Warehouse { _id: string; warehouseName: string }

/**
 * Brand's New Job Sheet -- a real full page, not a modal. Per explicit
 * direction: the modal version cramped a genuinely dense multi-section
 * intake form into a "sided form" feel; this is a call-center intake
 * screen, not a quick popup, so it gets the room a full page gives it.
 * SC gets its own single-screen intake-through-closure flow instead (see
 * console/crm/jobsheets/sc) -- not this page.
 */
export default function NewJobSheetPage() {
  const router = useRouter()
  const { businessId } = useActiveBusinessId()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState({
    customerName: '', company: '', gstin: '', phone: '', email: '',
    address: '', city: '', state: '', pincode: '',
    deviceCategory: '' as DeviceCategory | '', brandId: '', pendingBrandName: '', seriesId: '', deviceModelId: '', deviceModel: '', variantId: '', imeiOrSerialNumber: '',
    faultCodeId: '', symptomCodeId: '', remark: '',
    appointmentType: '', requestType: '',
    warehouseId: '', title: '',
  })

  const { data: warehousesData } = useSWR(businessId ? `/api/warehouses?businessId=${businessId}` : null)
  const warehouses: Warehouse[] = warehousesData?.warehouses || warehousesData?.data || []

  const { data: appointmentTypesData } = useSWR(businessId ? `/api/crm-option-lists?listType=APPOINTMENT_TYPE&businessId=${businessId}` : null)
  const appointmentTypes: CrmOption[] = appointmentTypesData?.options || []

  const { data: requestTypesData } = useSWR(businessId ? `/api/crm-option-lists?listType=REQUEST_TYPE&businessId=${businessId}` : null)
  const requestTypes: CrmOption[] = requestTypesData?.options || []

  const { data: brandsData } = useSWR(businessId && form.deviceCategory ? `/api/brands?businessId=${businessId}&category=${form.deviceCategory}` : null)
  const brands: Brand[] = brandsData?.brands || brandsData?.data || []

  const { data: faultCodesData } = useSWR(businessId && form.deviceCategory ? `/api/fault-codes?businessId=${businessId}&deviceCategory=${form.deviceCategory}` : null)
  const faultCodes: FaultCode[] = faultCodesData?.faultCodes || faultCodesData?.data || []

  const { data: symptomCodesData } = useSWR(businessId && form.deviceCategory ? `/api/symptom-codes?businessId=${businessId}&deviceCategory=${form.deviceCategory}` : null)
  const symptomCodes: SymptomCode[] = symptomCodesData?.symptomCodes || symptomCodesData?.data || []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) {
      setFormError('Select a business first (top-right business switcher).')
      return
    }
    if (form.gstin.trim()) {
      const result = validateGSTIN(form.gstin)
      if (!result.valid) { setFormError(`GSTIN: ${result.reason}`); return }
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/crm/jobsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, businessId }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to create job sheet')
      router.push(`/console/crm/jobsheets/${d.jobSheet._id}`)
    } catch (err: any) {
      setFormError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = "w-full bg-surface border border-border rounded-control px-4 py-3 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
  const labelCls = "block text-sm font-medium text-ink-2 mb-2"

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="New Job Sheet"
        description="For a direct walk-in — no appointment needed first."
        actions={<Button variant="secondary" onClick={() => router.push('/console/crm/jobsheets')} icon={<ArrowLeft className="w-4 h-4" />}>Back</Button>}
      />

      {formError && (
        <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3 max-w-4xl">{formError}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
        <Card className="p-6 space-y-4">
          <h3 className="text-base font-semibold text-ink">Customer</h3>
          <div>
            <label className={labelCls}>Customer Name *</label>
            <input required value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                Company <span className="text-ink-3 font-normal">(B2B customer — invoice will show GST if GSTIN is given below)</span>
              </label>
              <input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>GSTIN</label>
              <input value={form.gstin} onChange={e => setForm(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} maxLength={15} className={`${inputCls} font-mono`} placeholder="22AAAAA0000A1Z5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Contact No *</label>
              <input required type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inputCls} />
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-base font-semibold text-ink">Address</h3>
          <div>
            <label className={labelCls}>Address</label>
            <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Pincode</label>
              <PincodeInput
                value={form.pincode}
                onChange={(value) => setForm(p => ({ ...p, pincode: value }))}
                onResolved={({ state, city }) => setForm(p => ({ ...p, state: p.state || state, city: p.city || city }))}
                placeholder="400001"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <StateSelect
                value={form.state}
                onChange={(value) => setForm(p => ({ ...p, state: value, city: '' }))}
                className={`${inputCls} appearance-none`}
              />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <CitySelect
                value={form.city}
                state={form.state}
                onChange={(value) => setForm(p => ({ ...p, city: value }))}
                className={inputCls}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-base font-semibold text-ink">Device</h3>
          <div>
            <label className={labelCls}>Device Category *</label>
            <select
              required
              value={form.deviceCategory}
              onChange={e => setForm(p => ({ ...p, deviceCategory: e.target.value as DeviceCategory | '', brandId: '', pendingBrandName: '', seriesId: '', deviceModelId: '', deviceModel: '', variantId: '', faultCodeId: '', symptomCodeId: '' }))}
              className={inputCls}
            >
              <option value="">Select device type…</option>
              {DEVICE_CATEGORIES.map(c => (
                <option key={c} value={c}>{DEVICE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <DeviceCatalogFields
            businessId={businessId}
            deviceCategory={form.deviceCategory}
            brands={brands}
            value={{ brandId: form.brandId, pendingBrandName: form.pendingBrandName, seriesId: form.seriesId, deviceModelId: form.deviceModelId, deviceModel: form.deviceModel, variantId: form.variantId }}
            onChange={(patch) => setForm(p => ({ ...p, ...patch }))}
            inputCls={inputCls}
            labelCls={labelCls}
          />
          <div>
            <label className={labelCls}>IMEI / Serial Number</label>
            <input value={form.imeiOrSerialNumber} onChange={e => setForm(p => ({ ...p, imeiOrSerialNumber: e.target.value }))} className={inputCls} />
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-base font-semibold text-ink">Visit</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Appointment Type</label>
              <select value={form.appointmentType} onChange={e => setForm(p => ({ ...p, appointmentType: e.target.value }))} className={inputCls}>
                <option value="">—</option>
                {appointmentTypes.map(o => <option key={o._id} value={o.code}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Request Type</label>
              <select value={form.requestType} onChange={e => setForm(p => ({ ...p, requestType: e.target.value }))} className={inputCls}>
                <option value="">—</option>
                {requestTypes.map(o => <option key={o._id} value={o.code}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {warehouses.length > 0 && (
            <div>
              <label className={labelCls}>Service Center / Warehouse</label>
              <select value={form.warehouseId} onChange={e => setForm(p => ({ ...p, warehouseId: e.target.value }))} className={inputCls}>
                <option value="">—</option>
                {warehouses.map(w => <option key={w._id} value={w._id}>{w.warehouseName}</option>)}
              </select>
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-base font-semibold text-ink">Issue</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Fault Code</label>
              <select
                value={form.faultCodeId}
                onChange={e => setForm(p => ({ ...p, faultCodeId: e.target.value }))}
                disabled={!form.deviceCategory}
                className={`${inputCls} disabled:opacity-50`}
              >
                <option value="">{!form.deviceCategory ? 'Select a device type first' : 'Select fault code…'}</option>
                {faultCodes.map(f => <option key={f._id} value={f._id}>{f.code} — {f.description}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Symptom Code</label>
              <select
                value={form.symptomCodeId}
                onChange={e => setForm(p => ({ ...p, symptomCodeId: e.target.value }))}
                disabled={!form.deviceCategory}
                className={`${inputCls} disabled:opacity-50`}
              >
                <option value="">{!form.deviceCategory ? 'Select a device type first' : 'Select symptom code…'}</option>
                {symptomCodes.map(s => <option key={s._id} value={s._id}>{s.code} — {s.description}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Fault in Device *</label>
            <textarea required rows={3} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Remark</label>
            <input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} className={inputCls} />
          </div>
        </Card>

        <div className="flex gap-3">
          <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => router.push('/console/crm/jobsheets')}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="lg"
            className="flex-1"
            disabled={submitting}
            icon={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
          >
            Create Job Sheet
          </Button>
        </div>
      </form>
    </div>
  )
}
