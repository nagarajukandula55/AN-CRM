'use client'

import { getAuthMe } from '@/lib/authMeCache'
import { useEffect, useState } from 'react'
import { LoadingPanel } from '@/components/ui/Spinner'
import { BrandWorkordersView } from './BrandWorkordersView'
import { SCWorkordersView } from './SCWorkordersView'

/**
 * Brand and Service Center get genuinely separate Workorders pages (see
 * BrandWorkordersView / SCWorkordersView) -- a call-center queue with
 * multi-technician assignment vs. a single-login shop's ageing-first list
 * -- not one shared table with a hidden column. This route just resolves
 * which business's operatingMode is active and picks one. POS has no
 * workorders at all (see sidebar-nav.ts's `modes` gate on this route) so
 * it never reaches this page in normal navigation; falls back to the
 * Brand view if reached directly with no operatingMode resolved yet.
 */
export default function JobSheetsPage() {
  const [operatingMode, setOperatingMode] = useState<'BRAND' | 'SC' | 'POS' | '' | null>(null)

  useEffect(() => {
    let cancelled = false
    getAuthMe().then((meData) => {
      if (cancelled) return
      const user = meData?.user ?? meData
      const activeBiz = (meData?.businesses ?? []).find((b: any) => b._id === user?.activeBusinessId)
      setOperatingMode(activeBiz?.operatingMode || '')
    }).catch(() => { if (!cancelled) setOperatingMode('') })
    return () => { cancelled = true }
  }, [])

  if (operatingMode === null) {
    return <LoadingPanel label="Loading workorders…" />
  }

  return operatingMode === 'SC' ? <SCWorkordersView /> : <BrandWorkordersView />
}
