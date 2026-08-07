export interface JobSheet {
  _id: string
  jobSheetNumber: string
  customerName: string
  title: string
  product?: string
  deviceModel?: string
  brandId?: { name?: string } | string
  status: string
  scheduledAt?: string
  invoiceNumber?: string
  createdAt: string
  completedAt?: string
  assignedTo?: { name?: string }
}

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
export const STATUS_TONE: Record<string, Tone> = {
  CREATED: 'info',
  REPAIR_STARTED: 'info',
  REPAIR_IN_PROGRESS: 'warning',
  PART_PENDING: 'warning',
  REPAIR_COMPLETED: 'info',
  CLOSED: 'success',
  CANCELLED: 'danger',
}

export const STATUSES = ['ALL', 'CREATED', 'REPAIR_STARTED', 'REPAIR_IN_PROGRESS', 'PART_PENDING', 'REPAIR_COMPLETED', 'CLOSED', 'CANCELLED']
export const OPEN_STATUSES = new Set(['CREATED', 'REPAIR_STARTED', 'REPAIR_IN_PROGRESS', 'REPAIR_COMPLETED'])

export const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export function ageingDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

// TAT (turnaround time): creation -> repair complete. Still running (no
// completedAt yet) shows elapsed-so-far with a suffix, so the list reads
// as "how long has this actually taken" for closed jobs and "how long has
// this been open" for jobs still in flight -- same figure, same column.
export function tatLabel(createdAt: string, completedAt?: string): string {
  const ms = (completedAt ? new Date(completedAt).getTime() : Date.now()) - new Date(createdAt).getTime()
  const hours = ms / 3600000
  const value = hours < 48 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`
  return completedAt ? value : `${value}+`
}
