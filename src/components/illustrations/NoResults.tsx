export function NoResultsIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="24" y="20" width="56" height="70" rx="6" style={{ fill: 'var(--surface-2)' }} stroke="var(--border-strong)" strokeWidth="1.5" />
      <rect x="34" y="34" width="36" height="4" rx="2" style={{ fill: 'var(--border-strong)' }} />
      <rect x="34" y="44" width="36" height="4" rx="2" style={{ fill: 'var(--border-strong)' }} />
      <rect x="34" y="54" width="20" height="4" rx="2" style={{ fill: 'var(--border-strong)' }} />
      <circle cx="76" cy="76" r="18" style={{ fill: 'var(--surface)' }} stroke="var(--accent)" strokeWidth="3" />
      <line x1="88.5" y1="88.5" x2="100" y2="100" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}
