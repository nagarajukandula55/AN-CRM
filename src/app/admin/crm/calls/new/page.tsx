'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { StateSelect, CitySelect, PincodeInput } from '@/components/shared/LocationSelect'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from '@/core/catalog/deviceCategory'
import { DeviceCatalogFields } from '@/components/crm/DeviceCatalogFields'

interface Brand { _id: string; name: string; parentId?: string | null; logoUrl?: string }
interface FaultCode { _id: string; code: string; description: string }
interface SymptomCode { _id: string; code: string; description: string }

export default function NewAppointmentPage() {
  const router = useRouter()
  const { businessId } = useActiveBusinessId()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState({
    customerName: '', phone: '', email: '',
    address: '', city: '', state: '', pincode: '',
    source: 'User Contact', deviceCategory: '' as DeviceCategory | '', brandId: '', pendingBrandName: '', seriesId: '', deviceModelId: '', deviceModel: '', variantId: '',
    faultCodeId: '', symptomCodeId: '', subject: '',
  })

  // Admin appointment form has no vendor context to restrict Device
  // Category to -- shows all 12, unlike the vendor-side form which limits
  // this to the logged-in vendor's own productCategories.
  const canLoadDeviceRefs = Boolean(businessId && form.deviceCategory)

  const { data: brandsRes } = useSWR(
    canLoadDeviceRefs ? `/api/brands?businessId=${businessId}&category=${form.deviceCategory}` : null
  )
  const brands: Brand[] = brandsRes?.brands || brandsRes?.data || []

  const { data: faultCodesRes } = useSWR(
    canLoadDeviceRefs ? `/api/fault-codes?businessId=${businessId}&deviceCategory=${form.deviceCategory}` : null
  )
  const faultCodes: FaultCode[] = faultCodesRes?.faultCodes || faultCodesRes?.data || []

  const { data: symptomCodesRes } = useSWR(
    canLoadDeviceRefs ? `/api/symptom-codes?businessId=${businessId}&deviceCategory=${form.deviceCategory}` : null
  )
  const symptomCodes: SymptomCode[] = symptomCodesRes?.symptomCodes || symptomCodesRes?.data || []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) {
      setFormError('Select a business first (top-right business switcher) before creating an appointment.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/crm/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, businessId }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to create appointment')
      router.push(`/admin/crm/calls/${d.call._id}`)
    } catch (err: any) {
      setFormError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = "w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400"
  const labelCls = "block text-xs text-gray-500 mb-1.5"

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.push('/admin/crm/calls')} className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">New Appointment</h1>
          </div>
        </div>

        {formError && (
          <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{formError}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Customer</h2>
            <div>
              <label className={labelCls}>Customer Name *</label>
              <input type="text" required value={form.customerName} onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Contact No *</label>
                <input type="tel" required value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Source *</label>
              <select value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))} className={inputCls}>
                <option value="Website">Website</option>
                <option value="User Contact">User Contact</option>
              </select>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Address</h2>
            <div>
              <label className={labelCls}>Address</label>
              <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} className={inputCls} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Pincode</label>
                <PincodeInput
                  value={form.pincode}
                  onChange={(value) => setForm((p) => ({ ...p, pincode: value }))}
                  onResolved={({ state, city }) => setForm((p) => ({ ...p, state: p.state || state, city: p.city || city }))}
                  placeholder="400001"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>State</label>
                <StateSelect
                  value={form.state}
                  onChange={(value) => setForm((p) => ({ ...p, state: value, city: '' }))}
                  className={`${inputCls} appearance-none`}
                />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <CitySelect
                  value={form.city}
                  state={form.state}
                  onChange={(value) => setForm((p) => ({ ...p, city: value }))}
                  className={inputCls}
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Device & Issue</h2>
            <div>
              <label className={labelCls}>Device Category *</label>
              <select
                required
                value={form.deviceCategory}
                onChange={(e) => setForm((p) => ({ ...p, deviceCategory: e.target.value as DeviceCategory | '', brandId: '', pendingBrandName: '', seriesId: '', deviceModelId: '', deviceModel: '', variantId: '', faultCodeId: '', symptomCodeId: '' }))}
                className={inputCls}
              >
                <option value="">Select device type…</option>
                {DEVICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{DEVICE_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <DeviceCatalogFields
              businessId={businessId}
              deviceCategory={form.deviceCategory}
              brands={brands}
              value={{ brandId: form.brandId, pendingBrandName: form.pendingBrandName, seriesId: form.seriesId, deviceModelId: form.deviceModelId, deviceModel: form.deviceModel, variantId: form.variantId }}
              onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
              inputCls={inputCls}
              labelCls={labelCls}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Fault Code</label>
                <select
                  value={form.faultCodeId}
                  onChange={(e) => setForm((p) => ({ ...p, faultCodeId: e.target.value }))}
                  disabled={!form.deviceCategory}
                  className={`${inputCls} disabled:opacity-50`}
                >
                  <option value="">{!form.deviceCategory ? 'Select a device type first' : 'Select fault code…'}</option>
                  {faultCodes.map((f) => (
                    <option key={f._id} value={f._id}>{f.code} — {f.description}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Symptom Code</label>
                <select
                  value={form.symptomCodeId}
                  onChange={(e) => setForm((p) => ({ ...p, symptomCodeId: e.target.value }))}
                  disabled={!form.deviceCategory}
                  className={`${inputCls} disabled:opacity-50`}
                >
                  <option value="">{!form.deviceCategory ? 'Select a device type first' : 'Select symptom code…'}</option>
                  {symptomCodes.map((s) => (
                    <option key={s._id} value={s._id}>{s.code} — {s.description}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Fault in Device *</label>
              <textarea required value={form.subject} rows={3} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} className={`${inputCls} resize-none`} />
            </div>
          </section>

          <div className="flex gap-3">
            <button type="button" onClick={() => router.push('/admin/crm/calls')} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-500 hover:text-gray-900 transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Appointment
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
