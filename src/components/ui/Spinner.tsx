import { Loader2 } from 'lucide-react'
import { cn } from './cn'

/** One spinner -- `animate-spin` was hand-rolled in 78 files (per the UI
 * audit); this is the one place size/color decisions live now. */
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <Loader2 style={{ width: size, height: size }} className={cn('animate-spin text-accent', className)} />
}

/** Full-panel loading state -- centers a Spinner with consistent padding,
 * for the common "this whole card/page is loading" case. */
export function LoadingPanel({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-3">
      <Spinner size={28} />
      <p className="text-sm">{label}</p>
    </div>
  )
}
