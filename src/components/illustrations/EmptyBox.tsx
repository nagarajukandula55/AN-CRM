/**
 * Simple, flat, geometric illustrations for empty/loading/error states --
 * built from the app's own tokens (var(--accent) etc.) via inline style so
 * they theme automatically, not colored-in stock art. Kept restrained
 * (line + one fill tone) to match the "ledger/enterprise" tone of the
 * rest of the product rather than a generic gradient-blob illustration.
 */

export function EmptyBoxIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="46" width="84" height="52" rx="6" style={{ fill: 'var(--surface-2)' }} stroke="var(--border-strong)" strokeWidth="1.5" />
      <path d="M18 52 L60 30 L102 52" stroke="var(--border-strong)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <path d="M18 52 L60 74 L102 52" stroke="var(--border-strong)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <rect x="44" y="58" width="32" height="8" rx="4" style={{ fill: 'var(--accent-soft)' }} />
      <circle cx="60" cy="30" r="4" style={{ fill: 'var(--accent)' }} />
    </svg>
  )
}
