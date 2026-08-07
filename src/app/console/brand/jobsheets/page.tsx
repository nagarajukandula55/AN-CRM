'use client'

import { BrandWorkordersView } from './BrandWorkordersView'

/**
 * Brand's own Workorders page -- a call-center queue with multi-technician
 * assignment, distinct from SC's single-login ageing-first flow (see
 * console/sc/jobsheets, a completely separate page/route now). Reached from
 * an appointment's "Convert to Job Sheet" action, or directly from the nav.
 */
export default function JobSheetsPage() {
  return <BrandWorkordersView />
}
