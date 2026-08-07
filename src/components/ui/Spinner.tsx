import { motion } from '@/components/motion'
import { cn } from './cn'

/** One spinner -- `animate-spin` was hand-rolled in 78 files (per the UI
 * audit); this is the one place size/color decisions live now. Built on
 * the shared motion adapter (see components/motion) instead of a raw
 * CSS `animate-spin` class, so its easing/feel can change platform-wide
 * from one place, and so it composes with the fade-in wrapper below. */
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      style={{ width: size, height: size }}
      className={cn('text-accent', className)}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="42 56" opacity="0.9" />
    </motion.svg>
  )
}

/** Full-panel loading state -- centers a Spinner with consistent padding,
 * for the common "this whole card/page is loading" case. Fades in rather
 * than popping, so a fast load doesn't flash it jarringly. */
export function LoadingPanel({ label = 'Loading…' }: { label?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col items-center justify-center gap-3 py-16 text-ink-3"
    >
      <Spinner size={28} />
      <p className="text-sm">{label}</p>
    </motion.div>
  )
}
