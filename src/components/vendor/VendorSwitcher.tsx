'use client'

/**
 * Lets a parent vendor Owner switch between their own vendor identity and
 * any sub-vendor they've created (VendorProfile.parentVendorId) -- the same
 * switch-vendor mechanism sidebar.tsx already has for the console side, now
 * also reachable here since console/layout.tsx blocks every vendor identity
 * from the /console/* tree entirely (this used to be the only place a
 * vendor could reach that switcher, which meant a vendor with sub-vendors
 * had no way to switch into one at all anymore).
 *
 * Every /vendor/* page's data automatically follows whichever identity is
 * active -- api/auth/switch-vendor re-issues the session JWT with a new
 * activeVendorId claim, and resolveAuthorizedVendorScope (used by every
 * vendor-scoped API route) re-validates that claim against a live
 * parentVendorId lookup on every request, so this can never be used to view
 * an unrelated vendor's data.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Check, Store } from 'lucide-react'

interface SubVendor {
  _id: string
  vendorId?: string
  companyName?: string
}

export default function VendorSwitcher() {
  const router = useRouter()
  const [ownVendorId, setOwnVendorId] = useState<string | null>(null)
  const [ownCompanyName, setOwnCompanyName] = useState<string | null>(null)
  const [ownCode, setOwnCode] = useState<string | null>(null)
  const [subVendors, setSubVendors] = useState<SubVendor[]>([])
  const [activeVendorId, setActiveVendorId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/vendor/type-context')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.vendorId) return
        setOwnVendorId(d.vendorId)
        setActiveVendorId(d.vendorId)
        setOwnCompanyName(d.companyName || null)
        setOwnCode(d.vendorCode || null)
        return fetch(`/api/vendors/${d.vendorId}/sub-vendors`)
          .then((r) => (r.ok ? r.json() : null))
          .then((sd) => {
            if (cancelled) return
            setSubVendors(Array.isArray(sd?.subVendors) ? sd.subVendors : [])
          })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function switchTo(vendorId: string) {
    if (switching || vendorId === activeVendorId) { setOpen(false); return }
    setSwitching(true)
    try {
      const res = await fetch('/api/auth/switch-vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId }),
      })
      const d = await res.json()
      if (d.success) {
        setActiveVendorId(vendorId)
        setOpen(false)
        router.refresh()
        window.location.reload()
      }
    } catch {
      /* best-effort -- dropdown just stays open on failure */
    } finally {
      setSwitching(false)
    }
  }

  // Nothing to show for a plain vendor with no sub-vendors (the overwhelming
  // majority) -- no empty dropdown chrome for them.
  if (!ownVendorId || subVendors.length === 0) return null

  const activeName = activeVendorId === ownVendorId
    ? ownCompanyName
    : subVendors.find((sv) => sv._id === activeVendorId)?.companyName

  return (
    <div ref={ref} className="relative mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className="w-full flex items-center gap-2 rounded-control border border-border bg-surface-2 px-2.5 py-2 text-left hover:border-border-strong transition disabled:opacity-60"
      >
        <Store className="h-3.5 w-3.5 text-ink-3 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink truncate">{activeName || 'Select vendor'}</p>
          <p className="text-[10px] text-ink-3">{activeVendorId === ownVendorId ? 'Your account' : 'Sub-vendor'}</p>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-ink-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-control border border-border bg-surface shadow-card-lg overflow-hidden max-h-64 overflow-y-auto">
          <button
            type="button"
            onClick={() => switchTo(ownVendorId)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-surface-2 transition text-left"
          >
            <span className="text-ink truncate">{ownCompanyName || 'Your account'}{ownCode ? ` (${ownCode})` : ''}</span>
            {activeVendorId === ownVendorId && <Check size={12} className="shrink-0 text-success ml-2" />}
          </button>
          <div className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-ink-3">Sub-vendors</div>
          {subVendors.map((sv) => (
            <button
              key={sv._id}
              type="button"
              onClick={() => switchTo(sv._id)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-surface-2 transition text-left"
            >
              <span className="text-ink truncate">{sv.companyName || sv.vendorId}{sv.vendorId ? ` (${sv.vendorId})` : ''}</span>
              {activeVendorId === sv._id && <Check size={12} className="shrink-0 text-success ml-2" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
