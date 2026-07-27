import { cn } from './cn'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TONE_CLS: Record<Tone, string> = {
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
  info: 'bg-info-soft text-info border-info/20',
  neutral: 'bg-surface-2 text-ink-2 border-border-strong',
}

/** One status-pill implementation -- was reimplemented per-page with
 * slightly different color values each time (see the UI audit). */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', TONE_CLS[tone])}>
      {children}
    </span>
  )
}
