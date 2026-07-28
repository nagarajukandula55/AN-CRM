'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { DeviceCategory } from '@/core/catalog/deviceCategory'
import { Field, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export type CatalogRequestKind = 'BRAND' | 'SERIES' | 'MODEL' | 'VARIANT'

interface Props {
  open: boolean
  onClose: () => void
  businessId: string | null
  kind: CatalogRequestKind
  // Scope fields — pass whichever are relevant for `kind`, per
  // CatalogChangeRequest's schema (category for BRAND; brandId for SERIES/
  // MODEL; seriesId optionally for MODEL; modelId for VARIANT).
  category?: DeviceCategory | ''
  brandId?: string
  seriesId?: string
  modelId?: string
  // Called with the typed name once the request is submitted successfully
  // -- lets the parent form use it as a free-text stand-in for THIS
  // submission right away (see DeviceCatalogFields' pendingXxxName props),
  // instead of the user having to wait for approval and redo the form.
  onSuccess?: (name: string) => void
}

const KIND_LABEL: Record<CatalogRequestKind, string> = {
  BRAND: 'Brand',
  SERIES: 'Series',
  MODEL: 'Model',
  VARIANT: 'Variant',
}

// Lightweight submit-a-catalog-request modal, opened from the "Can't find
// it? Request to add" link next to the Brand/Series/Model/Variant pickers
// on the CRM call/jobsheet creation forms. Posts to /api/catalog/requests
// (kind is fixed by which dropdown the user was trying to fill).
//
// The success message used to be a hardcoded "Sent for approval" string --
// wrong for a Service Center business, where /api/catalog/requests now
// auto-approves and creates the real entity immediately (no queue at all,
// per explicit direction: SC self-manages its own catalog). The server
// already returns the right message for either case; this now displays
// THAT instead of assuming every business goes through approval.
export function CatalogRequestModal({ open, onClose, businessId, kind, category, brandId, seriesId, modelId, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) {
      setError('Could not determine your business — try reloading the page.')
      return
    }
    if (!name.trim()) {
      setError('Enter a name.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/catalog/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, kind, name: name.trim(), category: category || undefined, brandId: brandId || undefined, seriesId: seriesId || undefined, modelId: modelId || undefined }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to submit request')
      setResultMessage(d.message || 'Sent for approval. An admin will review this request.')
      onSuccess?.(name.trim())
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    setName('')
    setError(null)
    setResultMessage(null)
    onClose()
  }

  // Portaled to <body> -- this modal is rendered inline inside
  // DeviceCatalogFields, which itself sits inside the surrounding CRM
  // form. A <form> can't legally nest inside another <form>; the browser
  // silently closes/drops the nested one, so this modal's own Submit
  // button ends up submitting the OUTER job-sheet/call form instead (a
  // full-page reload, wiping all in-progress field state). Portaling out
  // of the DOM tree keeps this form independent of whatever form happens
  // to be rendering DeviceCatalogFields.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-card-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="h-section">Request to add a {KIND_LABEL[kind]}</h3>
          <button type="button" onClick={handleClose} className="w-7 h-7 rounded-control flex items-center justify-center hover:bg-surface-2 text-ink-3">
            <X className="w-4 h-4" />
          </button>
        </div>

        {resultMessage ? (
          <div className="space-y-4">
            <div className="text-sm text-success bg-success-soft border border-success/20 rounded-control px-4 py-3">
              {resultMessage}
            </div>
            <Button className="w-full" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>
            )}
            <Field label={`${KIND_LABEL[kind]} name`} required>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`e.g. New ${KIND_LABEL[kind].toLowerCase()} name`}
              />
            </Field>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>Cancel</Button>
              <Button type="submit" className="flex-1" loading={submitting}>Submit</Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}
