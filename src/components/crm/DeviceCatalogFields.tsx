'use client'

import { useEffect, useState } from 'react'
import { TreeSelect } from '@/components/shared/TreeSelect'
import { CatalogRequestModal, type CatalogRequestKind } from './CatalogRequestModal'
import type { DeviceCategory } from '@/core/catalog/deviceCategory'

interface BrandOption { _id: string; name: string; parentId?: string | null; logoUrl?: string }
interface SeriesOption { _id: string; name: string }
interface ModelOption { _id: string; name: string }
interface VariantOption { _id: string; name: string }

export interface DeviceCatalogValue {
  brandId: string
  seriesId: string
  deviceModelId: string
  deviceModel: string
  variantId: string
  // Set when the user raised a "Request to add" Brand request that's
  // still pending approval -- used as a free-text stand-in for brandId
  // so this submission isn't blocked waiting for Super Admin approval
  // (see CrmJobSheet.pendingBrandName / CrmCall.pendingBrandName).
  pendingBrandName?: string
}

interface Props {
  businessId: string | null
  deviceCategory: DeviceCategory | ''
  brands: BrandOption[]
  value: DeviceCatalogValue
  onChange: (patch: Partial<DeviceCatalogValue>) => void
  inputCls: string
  labelCls: string
}

// Device Category -> Brand -> Series -> Model -> Variant cascade, shared by
// all 4 CRM call/jobsheet creation forms. Brand is still fetched/rendered
// by the parent (passed in via `brands`) since it also scopes Fault Code /
// Symptom Code fetches there; this component owns the Series -> Model ->
// Variant fetch-on-parent-change chain plus the "Can't find it? Request to
// add" flow for whichever level the user was trying to fill.
export function DeviceCatalogFields({ businessId, deviceCategory, brands, value, onChange, inputCls, labelCls }: Props) {
  const [series, setSeries] = useState<SeriesOption[]>([])
  const [models, setModels] = useState<ModelOption[]>([])
  const [variants, setVariants] = useState<VariantOption[]>([])
  const [requestModal, setRequestModal] = useState<CatalogRequestKind | null>(null)

  // Refetch Series whenever Brand changes.
  useEffect(() => {
    if (!value.brandId || !businessId) { setSeries([]); return }
    fetch(`/api/series?businessId=${businessId}&brandId=${value.brandId}`)
      .then((r) => r.json())
      .then((d) => setSeries(d.series || []))
      .catch(() => setSeries([]))
  }, [value.brandId, businessId])

  // Refetch Models whenever Brand or Series changes -- scoped to the
  // series when one is picked, or brand-only ("Direct") when it's not, so
  // models with no series still show.
  useEffect(() => {
    if (!value.brandId || !businessId) { setModels([]); return }
    const url = value.seriesId
      ? `/api/device-models?businessId=${businessId}&brandId=${value.brandId}&seriesId=${value.seriesId}`
      : `/api/device-models?businessId=${businessId}&brandId=${value.brandId}`
    fetch(url)
      .then((r) => r.json())
      .then((d) => setModels(d.models || []))
      .catch(() => setModels([]))
  }, [value.brandId, value.seriesId, businessId])

  useEffect(() => {
    if (!value.deviceModelId || !businessId) { setVariants([]); return }
    fetch(`/api/variants?businessId=${businessId}&modelId=${value.deviceModelId}`)
      .then((r) => r.json())
      .then((d) => setVariants(d.variants || []))
      .catch(() => setVariants([]))
  }, [value.deviceModelId, businessId])

  const linkCls = "text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2"

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelCls.replace('mb-1.5', '')}>Device Brand *</label>
            {!value.pendingBrandName && (
              <button type="button" className={linkCls} onClick={() => setRequestModal('BRAND')}>Can't find it? Request to add</button>
            )}
          </div>
          {value.pendingBrandName ? (
            <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm">
              <span className="text-amber-800">
                <span className="font-medium">{value.pendingBrandName}</span> — pending approval, usable for this submission only
              </span>
              <button
                type="button"
                className="text-xs text-amber-700 underline underline-offset-2 shrink-0"
                onClick={() => onChange({ pendingBrandName: '', brandId: '', seriesId: '', deviceModelId: '', deviceModel: '', variantId: '' })}
              >
                Use different brand
              </button>
            </div>
          ) : (
            <TreeSelect
              items={brands}
              value={value.brandId}
              onChange={(id) => onChange({ brandId: id, seriesId: '', deviceModelId: '', deviceModel: '', variantId: '' })}
              placeholder={!deviceCategory ? 'Select a device type first' : 'Select brand…'}
              className={`${inputCls} ${!deviceCategory ? 'opacity-50 pointer-events-none' : ''}`}
            />
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelCls.replace('mb-1.5', '')}>Series</label>
            {value.brandId && (
              <button type="button" className={linkCls} onClick={() => setRequestModal('SERIES')}>Can't find it? Request to add</button>
            )}
          </div>
          <select
            value={value.seriesId}
            onChange={(e) => onChange({ seriesId: e.target.value, deviceModelId: '', deviceModel: '', variantId: '' })}
            disabled={!value.brandId}
            title="Select series"
            className={`${inputCls} disabled:opacity-50`}
          >
            <option value="">{!value.brandId ? 'Select a brand first' : 'No specific series / Direct'}</option>
            {series.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelCls.replace('mb-1.5', '')}>Model *</label>
            {value.brandId && (
              <button type="button" className={linkCls} onClick={() => setRequestModal('MODEL')}>Can't find it? Request to add</button>
            )}
          </div>
          <select
            // Not required when a model name is already set some other
            // way (typed via a still-pending "Request to add" — see
            // handleRequestSuccess below) -- otherwise the native
            // required-empty-select block would stop the user from
            // submitting at all while waiting for approval.
            required={!value.deviceModel}
            value={value.deviceModelId}
            onChange={(e) => {
              const m = models.find((mm) => mm._id === e.target.value)
              onChange({ deviceModelId: e.target.value, deviceModel: m?.name || '', variantId: '' })
            }}
            disabled={!value.brandId}
            title="Select model"
            className={`${inputCls} disabled:opacity-50`}
          >
            <option value="">{!value.brandId ? 'Select a brand first' : value.deviceModel || 'Select model…'}</option>
            {models.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
          </select>
          {value.deviceModel && !value.deviceModelId && (
            <p className="mt-1 text-xs text-amber-700">
              "{value.deviceModel}" — pending approval, usable for this submission only.
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelCls.replace('mb-1.5', '')}>Variant</label>
            {value.deviceModelId && (
              <button type="button" className={linkCls} onClick={() => setRequestModal('VARIANT')}>Can't find it? Request to add</button>
            )}
          </div>
          <select
            value={value.variantId}
            onChange={(e) => onChange({ variantId: e.target.value })}
            disabled={!value.deviceModelId}
            title="Select variant"
            className={`${inputCls} disabled:opacity-50`}
          >
            <option value="">No specific variant</option>
            {variants.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
          </select>
        </div>
      </div>

      {requestModal && (
        <CatalogRequestModal
          open={!!requestModal}
          onClose={() => setRequestModal(null)}
          businessId={businessId}
          kind={requestModal}
          category={deviceCategory}
          brandId={value.brandId}
          seriesId={value.seriesId}
          modelId={value.deviceModelId}
          onSuccess={(name) => {
            // BRAND/MODEL block form submission when empty (see the
            // required-select/pendingBrandName UI above) -- use the typed
            // name for THIS submission right away instead of making the
            // user wait for Super Admin approval and redo the form later.
            // SERIES/VARIANT are both optional fields with no such
            // blocker, so they stay request-only (nothing to unblock).
            if (requestModal === 'BRAND') {
              onChange({ pendingBrandName: name, brandId: '', seriesId: '', deviceModelId: '', deviceModel: '', variantId: '' })
            } else if (requestModal === 'MODEL') {
              onChange({ deviceModelId: '', deviceModel: name, variantId: '' })
            }
          }}
        />
      )}
    </>
  )
}
