'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, type DeviceCategory } from '@/core/catalog/deviceCategory'
import { Button } from '@/components/ui/Button'

// SC's own New Job Sheet modal -- deliberately a SEPARATE component from
// BrandNewJobSheetModal, not one shared modal branching on operatingMode.
// A single-login shop doesn't route between centers or wait on a shared
// catalog approval queue, so this form drops everything that exists only
// for that: no Appointment Type / Request Type / Warehouse routing
// dropdowns, no Fault/Symptom Code taxonomy picker, no brand/series/model/
// variant tree -- just plain Brand/Model text fields (this business
// self-manages its own catalog instantly, per /api/catalog/requests, so
// there's nothing to pick from a shared tree in the first place). Fewer
// fields, bigger text, one screen -- built for someone running the counter
// alone, not a call-center intake queue. See BrandNewJobSheetModal for the
// full-dropdown version.
const inputCls = "w-full bg-surface border border-border rounded-control px-4 py-3 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
const labelCls = "block text-sm font-medium text-ink-2 mb-2"

export function SCNewJobSheetModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { businessId } = useActiveBusinessId()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState({
    customerName: '', phone: '',
    deviceCategory: '' as DeviceCategory | '', brandName: '', deviceModel: '', imeiOrSerialNumber: '',
    title: '', remark: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) {
      setFormError('Select a business first (top-right business switcher).')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/crm/jobsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.customerName,
          phone: form.phone,
          deviceCategory: form.deviceCategory,
          pendingBrandName: form.brandName,
          deviceModel: form.deviceModel,
          imeiOrSerialNumber: form.imeiOrSerialNumber,
          title: form.title,
          remark: form.remark,
          businessId,
        }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to create job sheet')
      onCreated(d.jobSheet._id)
    } catch (err: any) {
      setFormError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-surface border border-border rounded-card flex flex-col overflow-hidden shadow-card-lg">
        <div className="flex items-center justify-between px-8 py-6 border-b border-border">
          <div>
            <h2 className="h-section text-xl">New Job Sheet</h2>
            <p className="text-sm text-ink-3 mt-1">Quick intake for a walk-in customer.</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-control bg-surface-2 border border-border flex items-center justify-center hover:bg-surface-3 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {formError && (
            <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{formError}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Customer Name *</label>
              <input required value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Contact No *</label>
              <input required type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Device Category *</label>
            <select
              required
              value={form.deviceCategory}
              onChange={e => setForm(p => ({ ...p, deviceCategory: e.target.value as DeviceCategory | '' }))}
              className={inputCls}
            >
              <option value="">Select device type…</option>
              {DEVICE_CATEGORIES.map(c => (
                <option key={c} value={c}>{DEVICE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Brand</label>
              <input value={form.brandName} onChange={e => setForm(p => ({ ...p, brandName: e.target.value }))} className={inputCls} placeholder="e.g. Samsung" />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <input value={form.deviceModel} onChange={e => setForm(p => ({ ...p, deviceModel: e.target.value }))} className={inputCls} placeholder="e.g. Galaxy M14" />
            </div>
          </div>
          <p className="text-xs text-ink-3 -mt-3">Added straight to your shop's own catalog — no approval needed.</p>

          <div>
            <label className={labelCls}>IMEI / Serial Number</label>
            <input value={form.imeiOrSerialNumber} onChange={e => setForm(p => ({ ...p, imeiOrSerialNumber: e.target.value }))} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Fault in Device *</label>
            <textarea required rows={3} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Remark</label>
            <input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} className={inputCls} />
          </div>
        </form>

        <div className="px-8 py-5 border-t border-border flex gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={handleSubmit}
            disabled={submitting}
            icon={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
          >
            Create Job Sheet
          </Button>
        </div>
      </div>
    </div>
  )
}
